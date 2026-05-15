package services

import (
	"database/sql"
	"encoding/csv"
	"encoding/hex"
	"fmt"
	"io"
	"math"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ssnodgrass/race-assistant/internal/repository"
	"github.com/ssnodgrass/race-assistant/models"
	"github.com/wailsapp/wails/v3/pkg/application"
	"go.bug.st/serial"
)

var timeRegex = regexp.MustCompile(`(\d{1,2}:)?\d{1,2}:\d{2}\.\d{1,3}`)

var stopwatchUploadCommand = []byte{0x14, 0x14}

const (
	stopwatchSettleDelay   = 500 * time.Millisecond
	stopwatchRetryInterval = 2 * time.Second
	stopwatchMaxRetries    = 4
)

type StopwatchService struct {
	app        *application.App
	timingRepo *repository.TimingRepository

	mu                  sync.Mutex
	capturedTimes       []models.ImportedTime
	capturedSegments    map[int][]models.ImportedTime
	captureBuffer       []byte
	includeTerminalStop bool
	isCapturing         bool
	stopSignal          chan struct{}
	activePort          serial.Port
}

func NewStopwatchService(timingRepo *repository.TimingRepository) *StopwatchService {
	return &StopwatchService{
		timingRepo:       timingRepo,
		capturedTimes:    []models.ImportedTime{},
		capturedSegments: map[int][]models.ImportedTime{},
	}
}

func (s *StopwatchService) SetApp(app *application.App) {
	s.app = app
}

func (s *StopwatchService) SetDB(db *sql.DB) {
	s.timingRepo.SetDB(db)
}

func (s *StopwatchService) ListPorts() ([]string, error) {
	return serial.GetPortsList()
}

func (s *StopwatchService) SendCommand(portName string, cmd string) error {
	payload, err := parseCommandPayload(cmd)
	if err != nil {
		return err
	}

	s.mu.Lock()
	p := s.activePort
	s.mu.Unlock()

	if p != nil {
		_, err = p.Write(payload)
		if err == nil && s.app != nil {
			s.app.Event.Emit("stopwatch:command-sent", map[string]interface{}{
				"bytes": len(payload),
				"hex":   fmt.Sprintf("% x", payload),
			})
		}
		return err
	}

	mode := &serial.Mode{BaudRate: 9600}
	port, err := serial.Open(portName, mode)
	if err != nil {
		return err
	}
	defer port.Close()

	_, err = port.Write(payload)
	if err == nil && s.app != nil {
		s.app.Event.Emit("stopwatch:command-sent", map[string]interface{}{
			"bytes": len(payload),
			"hex":   fmt.Sprintf("% x", payload),
		})
	}
	return err
}

func (s *StopwatchService) StartCapture(portName string, baudRate int, dataBits int, stopBits string, parity string, includeTerminalStop bool) error {
	s.mu.Lock()
	if s.isCapturing {
		s.mu.Unlock()
		return fmt.Errorf("capture already in progress")
	}

	if baudRate <= 0 {
		baudRate = 4800
	}
	if dataBits <= 0 {
		dataBits = 8
	}

	p := serial.NoParity
	switch strings.ToLower(parity) {
	case "even":
		p = serial.EvenParity
	case "odd":
		p = serial.OddParity
	}

	sb := serial.OneStopBit
	switch stopBits {
	case "1.5":
		sb = serial.OnePointFiveStopBits
	case "2":
		sb = serial.TwoStopBits
	}

	mode := &serial.Mode{
		BaudRate: baudRate,
		DataBits: dataBits,
		Parity:   p,
		StopBits: sb,
		InitialStatusBits: &serial.ModemOutputBits{
			DTR: true,
			RTS: true,
		},
	}

	port, err := serial.Open(portName, mode)
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("failed to open port %s: %w", portName, err)
	}

	s.activePort = port
	s.isCapturing = true
	s.stopSignal = make(chan struct{})
	s.capturedTimes = []models.ImportedTime{}
	s.capturedSegments = map[int][]models.ImportedTime{}
	s.captureBuffer = []byte{}
	s.includeTerminalStop = includeTerminalStop
	s.mu.Unlock()

	// Some USB-serial adapters/devices require a longer settle and line reset.
	_ = port.SetDTR(false)
	_ = port.SetRTS(false)
	time.Sleep(100 * time.Millisecond)
	_ = port.SetDTR(true)
	_ = port.SetRTS(true)
	time.Sleep(stopwatchSettleDelay)

	if err := s.sendUploadCommand(port, 1, "initial"); err != nil {
		port.Close()
		s.mu.Lock()
		s.activePort = nil
		s.isCapturing = false
		s.mu.Unlock()
		return fmt.Errorf("failed to send upload command: %w", err)
	}

	go s.serialReaderLoop()
	go s.uploadRetryLoop()
	return nil
}

func (s *StopwatchService) StopCapture() []models.ImportedTime {
	var raw []byte

	s.mu.Lock()
	if !s.isCapturing && len(s.capturedTimes) > 0 {
		out := append([]models.ImportedTime(nil), s.capturedTimes...)
		s.mu.Unlock()
		return out
	}
	if s.isCapturing {
		close(s.stopSignal)
		if s.activePort != nil {
			s.activePort.Close()
			s.activePort = nil
		}
		s.isCapturing = false
	}
	raw = append(raw, s.captureBuffer...)
	s.mu.Unlock()

	s.mu.Lock()
	includeTerminalStop := s.includeTerminalStop
	s.mu.Unlock()

	parsed, segments, meta := s.parseUpload(raw, includeTerminalStop)

	s.mu.Lock()
	s.capturedTimes = parsed
	s.capturedSegments = segments
	s.mu.Unlock()

	if s.app != nil {
		s.app.Event.Emit("stopwatch:summary", meta)
	}

	return s.capturedTimes
}

func (s *StopwatchService) ParseStopwatchText(content string) []models.ImportedTime {
	var results []models.ImportedTime
	lines := strings.Split(content, "\n")

	place := 1
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Try to find a time pattern anywhere in the line
		match := timeRegex.FindString(line)
		if match != "" {
			// Try to see if there is a number before the time to use as place
			var p int
			fields := strings.Fields(line)
			if len(fields) > 0 {
				if _, err := fmt.Sscanf(fields[0], "%d", &p); err == nil {
					place = p
				}
			}

			results = append(results, models.ImportedTime{
				Place: place,
				Time:  match,
			})
			place++
		}
	}
	return results
}

func (s *StopwatchService) serialReaderLoop() {
	s.mu.Lock()
	port := s.activePort
	stopSignal := s.stopSignal
	s.mu.Unlock()

	if port == nil {
		return
	}

	// Use a small read timeout so we can check the stop signal frequently
	port.SetReadTimeout(time.Millisecond * 500)

	buf := make([]byte, 1024)
	totalBytes := 0
	lastProgressAt := time.Now()

	for {
		select {
		case <-stopSignal:
			return
		default:
			n, err := port.Read(buf)
			if err != nil {
				// Timeout is expected
				if n == 0 {
					continue
				}
				if s.app != nil {
					s.app.Event.Emit("stopwatch:error", err.Error())
				}
				return
			}

			if n > 0 {
				var snapshot []byte

				s.mu.Lock()
				s.captureBuffer = append(s.captureBuffer, buf[:n]...)
				totalBytes += n
				snapshot = append(snapshot, s.captureBuffer...)
				s.mu.Unlock()
				lastProgressAt = time.Now()

				if s.app != nil {
					s.app.Event.Emit("stopwatch:progress", map[string]interface{}{
						"bytesRead": totalBytes,
						"status":    "receiving stopwatch bytes",
					})
				}

				if isUploadComplete(snapshot) {
					s.finalizeCapture(snapshot)
					return
				}
			} else if s.app != nil && time.Since(lastProgressAt) >= 2*time.Second {
				lastProgressAt = time.Now()
				s.app.Event.Emit("stopwatch:progress", map[string]interface{}{
					"bytesRead": totalBytes,
					"status":    "waiting for stopwatch response",
				})
			}
		}
	}
}

func (s *StopwatchService) uploadRetryLoop() {
	ticker := time.NewTicker(stopwatchRetryInterval)
	defer ticker.Stop()

	for attempt := 2; attempt <= stopwatchMaxRetries; attempt++ {
		select {
		case <-ticker.C:
		case <-s.stopSignal:
			return
		}

		s.mu.Lock()
		port := s.activePort
		captured := len(s.captureBuffer)
		capturing := s.isCapturing
		s.mu.Unlock()

		if !capturing || port == nil || captured > 0 {
			return
		}

		if err := s.sendUploadCommand(port, attempt, "retry"); err != nil {
			if s.app != nil {
				s.app.Event.Emit("stopwatch:error", fmt.Sprintf("retry %d upload command failed: %v", attempt, err))
			}
			return
		}
	}
}

func (s *StopwatchService) sendUploadCommand(port serial.Port, attempt int, phase string) error {
	if s.app != nil {
		s.app.Event.Emit("stopwatch:progress", map[string]interface{}{
			"bytesRead": 0,
			"status":    fmt.Sprintf("sending stopwatch upload command (%s attempt %d/%d)", phase, attempt, stopwatchMaxRetries),
		})
	}
	if _, err := port.Write(stopwatchUploadCommand); err != nil {
		return err
	}
	if s.app != nil {
		s.app.Event.Emit("stopwatch:command-sent", map[string]interface{}{
			"bytes":   len(stopwatchUploadCommand),
			"hex":     fmt.Sprintf("% x", stopwatchUploadCommand),
			"attempt": attempt,
			"phase":   phase,
		})
	}
	return nil
}

func (s *StopwatchService) finalizeCapture(raw []byte) {
	s.mu.Lock()
	includeTerminalStop := s.includeTerminalStop
	s.mu.Unlock()

	parsed, segments, meta := s.parseUpload(raw, includeTerminalStop)
	meta["autoComplete"] = true

	s.mu.Lock()
	if s.activePort != nil {
		s.activePort.Close()
		s.activePort = nil
	}
	s.isCapturing = false
	s.capturedTimes = parsed
	s.capturedSegments = segments
	s.mu.Unlock()

	if s.app != nil {
		for _, t := range parsed {
			s.app.Event.Emit("stopwatch:time", t)
		}
		s.app.Event.Emit("stopwatch:summary", meta)
		s.app.Event.Emit("stopwatch:capture-complete", map[string]interface{}{
			"recordsParsed": len(parsed),
		})
	}
}

func (s *StopwatchService) parseUploadedTimes(raw []byte) ([]models.ImportedTime, map[string]interface{}) {
	selected, _, meta := s.parseUpload(raw, true)
	return selected, meta
}

func (s *StopwatchService) ParseUploadedRaw(raw []byte) ([]models.ImportedTime, map[int][]models.ImportedTime, map[string]interface{}) {
	return s.parseUpload(raw, true)
}

func (s *StopwatchService) parseUpload(raw []byte, includeTerminalStop bool) ([]models.ImportedTime, map[int][]models.ImportedTime, map[string]interface{}) {
	meta := map[string]interface{}{
		"bytesRead":           len(raw),
		"firstBytesHex":       previewHex(raw, 64),
		"includeTerminalStop": includeTerminalStop,
	}

	if len(raw) == 0 {
		meta["error"] = "no data captured"
		return []models.ImportedTime{}, map[int][]models.ImportedTime{}, meta
	}

	candidateMarkers := findSegmentMarkers(raw, len(raw))
	padStart := -1
	if len(candidateMarkers) > 0 {
		padStart = findPaddingStartAfter(raw, candidateMarkers[0]+8)
	}
	if padStart <= 0 {
		padStart = findPaddingStart(raw)
	}
	if padStart <= 0 {
		meta["error"] = "unable to locate payload padding"
		return []models.ImportedTime{}, map[int][]models.ImportedTime{}, meta
	}
	meta["paddingOffset"] = padStart

	markers := findSegmentMarkers(raw, padStart)
	meta["markerCount"] = len(markers)
	if len(markers) > 0 {
		meta["firstMarkerOffset"] = markers[0]
		meta["lastMarkerOffset"] = markers[len(markers)-1]
	}

	footer := readFooter(raw, padStart)
	footerFields := parseFooter(footer)
	meta["footerHex"] = fmt.Sprintf("% x", footer)
	meta["segmentCount"] = footerFields.segmentCount
	meta["selectedSegment"] = footerFields.selectedSegment
	meta["selectedSegmentRecords"] = footerFields.selectedSegmentRecords
	meta["stopTime"] = centisecondsToTimeString(footerFields.stopCentiseconds)
	meta["stopCentiseconds"] = footerFields.stopCentiseconds

	if len(markers) == 0 {
		meta["error"] = "no segment markers found"
		return []models.ImportedTime{}, map[int][]models.ImportedTime{}, meta
	}

	blocks := buildSegmentBlocks(markers, padStart)
	if len(blocks) == 0 {
		meta["error"] = "no segment blocks found"
		return []models.ImportedTime{}, map[int][]models.ImportedTime{}, meta
	}

	activeBlocks := blocks
	if footerFields.segmentCount > 0 && footerFields.segmentCount <= len(blocks) {
		activeBlocks = blocks[:footerFields.segmentCount]
	}
	meta["activeBlockCount"] = len(activeBlocks)

	selectedIndex := footerFields.selectedSegment
	if selectedIndex <= 0 || selectedIndex > len(activeBlocks) {
		selectedIndex = len(activeBlocks)
	}
	meta["selectedSegment"] = selectedIndex

	segments := map[int][]models.ImportedTime{}
	segmentLapCounts := make([]int, 0, len(activeBlocks))
	selectedRecordsRead := 0

	for i, block := range activeBlocks {
		records := parseBlockRecords(raw, block.start, block.end)
		times := extractTimelineTimes(records)
		times, trimmedAtReset := trimTimelineAtReset(times)

		segIndex := i + 1
		if segIndex == footerFields.selectedSegment {
			expected := footerFields.selectedSegmentRecords
			if expected > 0 && expected <= len(times) {
				times = times[:expected]
			}
		}

		times = sanitizeSegmentTimeline(times, footerFields.stopCentiseconds, i == len(activeBlocks)-1, includeTerminalStop, trimmedAtReset)
		segments[segIndex] = toImportedTimes(times)
		segmentLapCounts = append(segmentLapCounts, len(times))

		if segIndex == selectedIndex {
			selectedRecordsRead = len(records)
		}
	}

	selected := segments[selectedIndex]
	meta["recordsRead"] = selectedRecordsRead
	meta["recordsParsed"] = len(selected)
	meta["segmentLapCounts"] = segmentLapCounts

	return selected, segments, meta
}

type footerFields struct {
	segmentCount           int
	selectedSegment        int
	selectedSegmentRecords int
	stopCentiseconds       int
}

type segmentBlock struct {
	start int
	end   int
}

type rawRecord struct {
	setID        int
	centiseconds int
}

func (r rawRecord) fullCentiseconds() int {
	if r.setID < 0 {
		return r.centiseconds
	}
	return (r.setID << 16) + r.centiseconds
}

func findPaddingStart(raw []byte) int {
	return findPaddingStartAfter(raw, 0)
}

func findPaddingStartAfter(raw []byte, start int) int {
	if start < 0 {
		start = 0
	}
	run := 0
	for i := start; i < len(raw); i++ {
		b := raw[i]
		if b == 0x55 {
			run++
			if run >= 64 {
				return i - run + 1
			}
		} else {
			run = 0
		}
	}
	return -1
}

func findSegmentMarkers(raw []byte, padStart int) []int {
	markers := []int{}
	for i := 0; i+7 < padStart; i++ {
		if raw[i] == 0xff && raw[i+1] == 0x20 && raw[i+2] == 0x11 {
			markers = append(markers, i)
		}
	}
	return markers
}

func buildSegmentBlocks(markers []int, padStart int) []segmentBlock {
	blocks := []segmentBlock{}
	for i, marker := range markers {
		start := marker + 8
		end := padStart
		if i+1 < len(markers) {
			end = markers[i+1]
		}
		if start < end && (end-start)%4 == 0 {
			blocks = append(blocks, segmentBlock{start: start, end: end})
		}
	}
	return blocks
}

func parseBlockRecords(raw []byte, start, end int) []rawRecord {
	records := []rawRecord{}
	for off := start; off+3 < end; off += 4 {
		setID := int(raw[off])<<8 | int(raw[off+1])
		cs := int(raw[off+2])<<8 | int(raw[off+3])
		records = append(records, rawRecord{
			setID:        setID,
			centiseconds: cs,
		})
	}
	return records
}

func extractTimelineTimes(records []rawRecord) []int {
	times := []int{}
	for _, rec := range records {
		// Filter known transport/control set IDs.
		if rec.setID == 0xff20 || rec.setID == 0x7f20 || rec.setID == 0x1383 || rec.setID == 0x1303 || rec.setID == 0x1392 {
			continue
		}
		// On short captures the high word stays at 0. On longer captures the
		// watch increments setID as the high 16 bits of the cumulative time.
		times = append(times, rec.fullCentiseconds())
	}
	return times
}

func sanitizeSegmentTimeline(times []int, stopCentiseconds int, isLastSegment bool, includeTerminalStop bool, trimmedAtReset bool) []int {
	if len(times) == 0 {
		return times
	}

	// T000 start marker should not be imported as a finisher lap.
	if times[0] == 0 {
		times = times[1:]
	}
	if len(times) == 0 {
		return times
	}

	// Intermediate segments include a terminal stop marker before the next segment header.
	if !isLastSegment {
		return times[:len(times)-1]
	}

	if !includeTerminalStop && trimmedAtReset && len(times) > 0 {
		return times[:len(times)-1]
	}

	// For the final segment, keep the terminal split by default.
	// Only trim when there is an obvious duplicate terminal control marker.
	hadDuplicateTerminal := false
	if stopCentiseconds > 0 && len(times) >= 2 && times[len(times)-1] == stopCentiseconds && times[len(times)-2] == stopCentiseconds {
		times = times[:len(times)-1]
		hadDuplicateTerminal = true
	}

	if !includeTerminalStop && !hadDuplicateTerminal && stopCentiseconds > 0 && len(times) > 0 && times[len(times)-1] == stopCentiseconds {
		return times[:len(times)-1]
	}

	return times
}

func trimTimelineAtReset(times []int) ([]int, bool) {
	if len(times) < 2 {
		return times, false
	}

	for i := 1; i < len(times); i++ {
		if times[i] <= times[i-1] {
			return times[:i], true
		}
	}

	return times, false
}

func toImportedTimes(times []int) []models.ImportedTime {
	imported := make([]models.ImportedTime, 0, len(times))
	for i, cs := range times {
		imported = append(imported, models.ImportedTime{
			Place: i + 1,
			Time:  centisecondsToTimeString(cs),
		})
	}
	return imported
}

func readFooter(raw []byte, padStart int) []byte {
	i := padStart
	for i < len(raw) && raw[i] == 0x55 {
		i++
	}
	if i >= len(raw) {
		return []byte{}
	}
	return raw[i:]
}

func parseFooter(footer []byte) footerFields {
	fields := footerFields{}
	if len(footer) < 8 {
		return fields
	}

	fields.segmentCount = int(footer[0])<<8 | int(footer[1])
	if len(footer) >= 6 {
		fields.selectedSegment = int(footer[4])<<8 | int(footer[5])
	}
	if len(footer) >= 8 {
		fields.selectedSegmentRecords = int(footer[6])<<8 | int(footer[7])
	}
	// Stop time appears as HH XX XX 00 where HH is the high-byte extension
	// for long runs. Short runs simply use HH=0.
	if len(footer) >= 12 {
		fields.stopCentiseconds = int(footer[8])<<16 | int(footer[9])<<8 | int(footer[10])
	}

	return fields
}

func centisecondsToTimeString(cs int) string {
	if cs < 0 {
		cs = 0
	}
	h := cs / 360000
	m := (cs % 360000) / 6000
	s := (cs % 6000) / 100
	c := cs % 100
	return fmt.Sprintf("%02d:%02d:%02d.%02d", h, m, s, c)
}

func isUploadComplete(raw []byte) bool {
	padStart := findPaddingStart(raw)
	if padStart <= 0 {
		return false
	}
	footer := readFooter(raw, padStart)
	// Observed footer size is 36 bytes in all known captures.
	return len(footer) >= 36
}

func (s *StopwatchService) IsUploadCompleteRaw(raw []byte) bool {
	return isUploadComplete(raw)
}

func parseCommandPayload(cmd string) ([]byte, error) {
	text := strings.TrimSpace(cmd)
	if text == "" {
		return nil, fmt.Errorf("command cannot be empty")
	}

	compact := strings.ReplaceAll(strings.ReplaceAll(text, " ", ""), "-", "")
	if len(compact) >= 2 && len(compact)%2 == 0 && isHexOnly(compact) {
		data, err := hex.DecodeString(compact)
		if err == nil {
			return data, nil
		}
	}

	// Fallback: plain ASCII command with CR terminator.
	return []byte(text + "\r"), nil
}

func isHexOnly(s string) bool {
	for _, r := range s {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') && (r < 'A' || r > 'F') {
			return false
		}
	}
	return true
}

func previewHex(raw []byte, max int) string {
	if len(raw) == 0 || max <= 0 {
		return ""
	}
	if len(raw) < max {
		max = len(raw)
	}
	return fmt.Sprintf("% x", raw[:max])
}

type watchwareRow struct {
	segment       int
	memSlot       int
	cumTimeCS     int
	cumTimeRaw    string
	sourceLineNum int
}

func (s *StopwatchService) LoadWatchwareExport(filePath string, includeTerminalStop bool) ([]models.ImportedTime, error) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	selected, segments, meta, err := parseWatchwareExport(string(content), includeTerminalStop)
	if err != nil {
		return nil, err
	}
	meta["source"] = "watchware-export"
	meta["filePath"] = filePath
	meta["includeTerminalStop"] = includeTerminalStop

	s.mu.Lock()
	s.capturedTimes = append([]models.ImportedTime(nil), selected...)
	s.capturedSegments = make(map[int][]models.ImportedTime, len(segments))
	for segment, times := range segments {
		s.capturedSegments[segment] = append([]models.ImportedTime(nil), times...)
	}
	s.captureBuffer = nil
	s.isCapturing = false
	s.mu.Unlock()

	if s.app != nil {
		s.app.Event.Emit("stopwatch:summary", meta)
	}

	return append([]models.ImportedTime(nil), selected...), nil
}

func parseWatchwareExport(content string, includeTerminalStop bool) ([]models.ImportedTime, map[int][]models.ImportedTime, map[string]interface{}, error) {
	meta := map[string]interface{}{
		"source":              "watchware-export",
		"includeTerminalStop": includeTerminalStop,
	}

	reader := csv.NewReader(strings.NewReader(content))
	reader.Comma = '\t'
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = false

	header, err := reader.Read()
	if err != nil {
		if err == io.EOF {
			return nil, nil, meta, fmt.Errorf("watchware export is empty")
		}
		return nil, nil, meta, err
	}

	indexes := map[string]int{}
	for i, name := range header {
		indexes[strings.TrimSpace(name)] = i
	}

	segmentIdx, ok := indexes["Segment"]
	if !ok {
		return nil, nil, meta, fmt.Errorf("watchware export missing Segment column")
	}
	memIdx, ok := indexes["Mem"]
	if !ok {
		return nil, nil, meta, fmt.Errorf("watchware export missing Mem column")
	}
	cumIdx, ok := indexes["Cum Time"]
	if !ok {
		return nil, nil, meta, fmt.Errorf("watchware export missing Cum Time column")
	}

	rowsBySegment := map[int][]watchwareRow{}
	totalRows := 0
	lineNum := 1

	for {
		lineNum++
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, nil, meta, err
		}

		if segmentIdx >= len(record) || memIdx >= len(record) || cumIdx >= len(record) {
			continue
		}

		segmentText := strings.TrimSpace(record[segmentIdx])
		memText := strings.TrimSpace(record[memIdx])
		cumText := strings.TrimSpace(record[cumIdx])
		if segmentText == "" || memText == "" || cumText == "" {
			continue
		}

		segment, err := strconv.Atoi(segmentText)
		if err != nil {
			continue
		}

		memSlot, err := parseWatchwareMemSlot(memText)
		if err != nil {
			continue
		}

		cumTimeCS, err := parseWatchwareCumTime(cumText)
		if err != nil {
			return nil, nil, meta, fmt.Errorf("line %d: invalid Cum Time %q: %w", lineNum, cumText, err)
		}

		rowsBySegment[segment] = append(rowsBySegment[segment], watchwareRow{
			segment:       segment,
			memSlot:       memSlot,
			cumTimeCS:     cumTimeCS,
			cumTimeRaw:    cumText,
			sourceLineNum: lineNum,
		})
		totalRows++
	}

	if len(rowsBySegment) == 0 {
		return nil, nil, meta, fmt.Errorf("watchware export did not contain any timing rows")
	}

	segmentIDs := make([]int, 0, len(rowsBySegment))
	for segmentID := range rowsBySegment {
		segmentIDs = append(segmentIDs, segmentID)
	}
	sort.Ints(segmentIDs)

	segments := make(map[int][]models.ImportedTime, len(segmentIDs))
	segmentLapCounts := make([]int, 0, len(segmentIDs))

	trimmedStopSegments := []int{}
	for _, segmentID := range segmentIDs {
		timeline, trimmedStop := normalizeWatchwareRows(rowsBySegment[segmentID], includeTerminalStop)
		if trimmedStop {
			trimmedStopSegments = append(trimmedStopSegments, segmentID)
		}
		imported := toImportedTimes(timeline)
		segments[segmentID] = imported
		segmentLapCounts = append(segmentLapCounts, len(imported))
	}

	selectedSegment := segmentIDs[0]
	selected := segments[selectedSegment]

	meta["recordsRead"] = totalRows
	meta["recordsParsed"] = len(selected)
	meta["segmentCount"] = len(segmentIDs)
	meta["selectedSegment"] = selectedSegment
	meta["segmentLapCounts"] = segmentLapCounts
	meta["selectedSegmentRecords"] = len(selected)
	meta["trimmedStopSegments"] = trimmedStopSegments

	return selected, segments, meta, nil
}

func parseWatchwareMemSlot(value string) (int, error) {
	text := strings.TrimSpace(strings.TrimPrefix(strings.ToUpper(value), "T"))
	if text == "" {
		return 0, fmt.Errorf("empty memory slot")
	}
	return strconv.Atoi(text)
}

func parseWatchwareCumTime(value string) (int, error) {
	seconds, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
	if err != nil {
		return 0, err
	}
	return int(math.Round(seconds * 100)), nil
}

func normalizeWatchwareRows(rows []watchwareRow, includeTerminalStop bool) ([]int, bool) {
	if len(rows) == 0 {
		return nil, false
	}

	ordered := append([]watchwareRow(nil), rows...)
	startIndex := 0
	for i, row := range ordered {
		if row.memSlot == 0 {
			startIndex = i
			break
		}
	}
	if startIndex > 0 {
		ordered = append(ordered[startIndex:], ordered[:startIndex]...)
	} else if ordered[0].memSlot != 0 {
		sort.SliceStable(ordered, func(i, j int) bool {
			return ordered[i].memSlot < ordered[j].memSlot
		})
	}

	trimmedStop := false
	if !includeTerminalStop && shouldTrimWatchwareTerminalStop(ordered) {
		ordered = ordered[:len(ordered)-1]
		trimmedStop = true
	}

	timeline := make([]int, 0, len(ordered))
	for _, row := range ordered {
		timeline = append(timeline, row.cumTimeCS)
	}

	if len(timeline) > 0 && timeline[0] == 0 {
		timeline = timeline[1:]
	}
	for len(timeline) >= 2 && timeline[len(timeline)-1] == timeline[len(timeline)-2] {
		timeline = timeline[:len(timeline)-1]
	}

	return timeline, trimmedStop
}

func shouldTrimWatchwareTerminalStop(rows []watchwareRow) bool {
	if len(rows) < 4 {
		return false
	}
	if rows[0].memSlot != 0 {
		return false
	}

	for i := 1; i < len(rows); i++ {
		if rows[i].memSlot != rows[i-1].memSlot+1 {
			return false
		}
	}

	lastGap := rows[len(rows)-1].cumTimeCS - rows[len(rows)-2].cumTimeCS
	if lastGap <= 0 {
		return false
	}

	recentGaps := make([]int, 0, len(rows)-2)
	for i := 2; i < len(rows)-1; i++ {
		gap := rows[i].cumTimeCS - rows[i-1].cumTimeCS
		if gap > 0 {
			recentGaps = append(recentGaps, gap)
		}
	}
	if len(recentGaps) == 0 {
		return false
	}

	sort.Ints(recentGaps)
	medianGap := recentGaps[len(recentGaps)/2]

	// Watchware exports do not explicitly flag the terminal stop row.
	// Treat the last record as a stop marker only when it is a clear outlier
	// compared with the normal finisher-to-finisher gaps in the same segment.
	return lastGap >= 6000 && lastGap >= medianGap*10
}

func (s *StopwatchService) CommitToRace(raceID int, times []models.ImportedTime) (int, error) {
	return s.CommitToRaceEvent(raceID, 0, false, times)
}

func (s *StopwatchService) CommitToRaceEvent(raceID int, eventID int, replaceExisting bool, times []models.ImportedTime) (int, error) {
	db := s.timingRepo.GetDB()
	if db == nil {
		return 0, fmt.Errorf("no database connection")
	}

	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	if replaceExisting {
		if eventID > 0 {
			if _, err := tx.Exec("DELETE FROM timing_pulses WHERE race_id = ? AND event_id = ?", raceID, eventID); err != nil {
				return 0, err
			}
		} else {
			if _, err := tx.Exec("DELETE FROM timing_pulses WHERE race_id = ?", raceID); err != nil {
				return 0, err
			}
		}
	}

	count := 0
	for _, t := range times {
		_, err = tx.Exec("INSERT INTO timing_pulses (race_id, event_id, place, raw_time) VALUES (?, ?, ?, ?)",
			raceID, eventID, t.Place, t.Time)
		if err == nil {
			count++
		}
	}

	err = tx.Commit()
	return count, err
}

func (s *StopwatchService) CommitCapturedSegments(raceID int, selections []models.SegmentEventSelection, replaceExisting bool) (int, error) {
	db := s.timingRepo.GetDB()
	if db == nil {
		return 0, fmt.Errorf("no database connection")
	}

	s.mu.Lock()
	segments := make(map[int][]models.ImportedTime, len(s.capturedSegments))
	for segment, times := range s.capturedSegments {
		segments[segment] = append([]models.ImportedTime(nil), times...)
	}
	s.mu.Unlock()

	if len(segments) == 0 {
		return 0, fmt.Errorf("no captured segments available")
	}

	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	replaced := map[int]bool{}
	count := 0

	for _, sel := range selections {
		if sel.EventID <= 0 {
			continue
		}
		times, ok := segments[sel.Segment]
		if !ok {
			continue
		}

		if replaceExisting && !replaced[sel.EventID] {
			if _, err := tx.Exec("DELETE FROM timing_pulses WHERE race_id = ? AND event_id = ?", raceID, sel.EventID); err != nil {
				return count, err
			}
			replaced[sel.EventID] = true
		}

		for _, t := range times {
			if _, err := tx.Exec("INSERT INTO timing_pulses (race_id, event_id, place, raw_time) VALUES (?, ?, ?, ?)", raceID, sel.EventID, t.Place, t.Time); err != nil {
				return count, err
			}
			count++
		}
	}

	if err := tx.Commit(); err != nil {
		return count, err
	}
	return count, nil
}
