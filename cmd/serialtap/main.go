package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/ssnodgrass/race-assistant/models"
	"github.com/ssnodgrass/race-assistant/services"
	"go.bug.st/serial"
)

var serialtapUploadCommand = []byte{0x14, 0x14}

func main() {
	portName := flag.String("port", "", "Serial port name, e.g. COM4")
	baudRate := flag.Int("baud", 4800, "Baud rate")
	dataBits := flag.Int("data-bits", 8, "Data bits")
	stopBitsFlag := flag.String("stop-bits", "1", "Stop bits: 1, 1.5, or 2")
	parityFlag := flag.String("parity", "none", "Parity: none, even, or odd")
	idleTimeout := flag.Duration("idle-timeout", 12*time.Second, "Stop after this much time without new bytes")
	retryInterval := flag.Duration("retry-interval", 2*time.Second, "Time between upload-command retries while waiting for first bytes")
	retries := flag.Int("retries", 4, "Maximum upload-command attempts including the initial send")
	outputDir := flag.String("out", "", "Output directory for raw.bin, summary.json, and segments.txt")
	listPorts := flag.Bool("list", false, "List detected serial ports and exit")
	flag.Parse()

	if *listPorts {
		ports, err := serial.GetPortsList()
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to list serial ports: %v\n", err)
			os.Exit(1)
		}
		if len(ports) == 0 {
			fmt.Println("no serial ports detected")
			return
		}
		for _, port := range ports {
			fmt.Println(port)
		}
		return
	}

	if *portName == "" {
		fmt.Fprintln(os.Stderr, "missing required -port")
		os.Exit(2)
	}

	mode, err := buildMode(*baudRate, *dataBits, *stopBitsFlag, *parityFlag)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	port, err := serial.Open(*portName, mode)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to open %s: %v\n", *portName, err)
		os.Exit(1)
	}
	defer port.Close()

	fmt.Fprintf(os.Stderr, "opened %s at %d baud (%d data bits, %s stop bits, %s parity)\n", *portName, *baudRate, *dataBits, *stopBitsFlag, *parityFlag)

	_ = port.SetDTR(false)
	_ = port.SetRTS(false)
	time.Sleep(100 * time.Millisecond)
	_ = port.SetDTR(true)
	_ = port.SetRTS(true)
	_ = port.SetReadTimeout(500 * time.Millisecond)
	time.Sleep(500 * time.Millisecond)
	fmt.Fprintln(os.Stderr, "DTR/RTS reset and asserted; sending upload command 14 14")

	if err := sendUploadCommand(port, 1, *retries, "initial"); err != nil {
		fmt.Fprintf(os.Stderr, "failed to send upload command: %v\n", err)
		os.Exit(1)
	}

	svc := services.NewStopwatchService(nil)
	buf := make([]byte, 1024)
	raw := make([]byte, 0, 8192)
	lastRead := time.Now()
	lastHeartbeat := time.Now()
	attempt := 1
	nextRetryAt := time.Now().Add(*retryInterval)
	fmt.Fprintf(os.Stderr, "waiting for upload bytes (idle timeout %s)\n", idleTimeout.String())

	for {
		n, err := port.Read(buf)
		if n > 0 {
			raw = append(raw, buf[:n]...)
			lastRead = time.Now()
			lastHeartbeat = time.Now()
			fmt.Fprintf(os.Stderr, "read %d bytes (%d total)\n", n, len(raw))
			if svc.IsUploadCompleteRaw(raw) {
				fmt.Fprintln(os.Stderr, "upload footer detected; capture complete")
				break
			}
		}

		if err != nil && n == 0 {
			if time.Since(lastRead) >= *idleTimeout {
				fmt.Fprintf(os.Stderr, "idle timeout reached after %s\n", idleTimeout.String())
				break
			}
			fmt.Fprintf(os.Stderr, "serial read error while idle: %v\n", err)
			continue
		}

		if n == 0 && time.Since(lastRead) >= *idleTimeout {
			fmt.Fprintf(os.Stderr, "idle timeout reached after %s with no new bytes\n", idleTimeout.String())
			break
		}

		if n == 0 && len(raw) == 0 && attempt < *retries && time.Now().After(nextRetryAt) {
			attempt++
			if err := sendUploadCommand(port, attempt, *retries, "retry"); err != nil {
				fmt.Fprintf(os.Stderr, "failed to resend upload command: %v\n", err)
				break
			}
			nextRetryAt = time.Now().Add(*retryInterval)
		}

		if n == 0 && time.Since(lastHeartbeat) >= 2*time.Second {
			lastHeartbeat = time.Now()
			fmt.Fprintf(os.Stderr, "still waiting: %d bytes captured so far, %s since last byte\n", len(raw), time.Since(lastRead).Round(time.Second))
		}
	}

	selected, segments, meta := svc.ParseUploadedRaw(raw)

	dir := *outputDir
	if dir == "" {
		dir = filepath.Join(".", "artifacts", "serialtap-"+time.Now().Format("20060102-150405"))
	}
	fmt.Fprintf(os.Stderr, "writing artifacts to %s\n", dir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "failed to create output directory: %v\n", err)
		os.Exit(1)
	}

	rawPath := filepath.Join(dir, "raw.bin")
	if err := os.WriteFile(rawPath, raw, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "failed to write raw capture: %v\n", err)
		os.Exit(1)
	}

	summaryPath := filepath.Join(dir, "summary.json")
	summaryBytes, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to encode summary: %v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(summaryPath, summaryBytes, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "failed to write summary: %v\n", err)
		os.Exit(1)
	}

	segmentsPath := filepath.Join(dir, "segments.txt")
	if err := os.WriteFile(segmentsPath, []byte(renderSegments(selected, segments)), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "failed to write segment report: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("wrote %d bytes to %s\n", len(raw), rawPath)
	fmt.Printf("wrote parse summary to %s\n", summaryPath)
	fmt.Printf("wrote segment report to %s\n", segmentsPath)
}

func sendUploadCommand(port serial.Port, attempt int, maxAttempts int, phase string) error {
	fmt.Fprintf(os.Stderr, "sending upload command 14 14 (%s attempt %d/%d)\n", phase, attempt, maxAttempts)
	_, err := port.Write(serialtapUploadCommand)
	return err
}

func buildMode(baudRate int, dataBits int, stopBitsFlag string, parityFlag string) (*serial.Mode, error) {
	parity := serial.NoParity
	switch strings.ToLower(strings.TrimSpace(parityFlag)) {
	case "", "none":
	case "even":
		parity = serial.EvenParity
	case "odd":
		parity = serial.OddParity
	default:
		return nil, fmt.Errorf("unsupported parity %q", parityFlag)
	}

	stopBits := serial.OneStopBit
	switch strings.TrimSpace(stopBitsFlag) {
	case "", "1":
	case "1.5":
		stopBits = serial.OnePointFiveStopBits
	case "2":
		stopBits = serial.TwoStopBits
	default:
		return nil, fmt.Errorf("unsupported stop bits %q", stopBitsFlag)
	}

	return &serial.Mode{
		BaudRate: baudRate,
		DataBits: dataBits,
		Parity:   parity,
		StopBits: stopBits,
		InitialStatusBits: &serial.ModemOutputBits{
			DTR: true,
			RTS: true,
		},
	}, nil
}

func renderSegments(selected []models.ImportedTime, segments map[int][]models.ImportedTime) string {
	var b strings.Builder
	b.WriteString("Selected segment preview\n")
	for _, t := range selected {
		b.WriteString(fmt.Sprintf("%d\t%s\n", t.Place, t.Time))
	}

	keys := make([]int, 0, len(segments))
	for segment := range segments {
		keys = append(keys, segment)
	}
	sort.Ints(keys)

	for _, segment := range keys {
		b.WriteString(fmt.Sprintf("\nSegment %d\n", segment))
		for _, t := range segments[segment] {
			b.WriteString(fmt.Sprintf("%d\t%s\n", t.Place, t.Time))
		}
	}

	return b.String()
}
