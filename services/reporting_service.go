package services

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/col"
	"github.com/johnfercher/maroto/v2/pkg/components/row"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/consts/align"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/core"
	"github.com/johnfercher/maroto/v2/pkg/props"
	"github.com/phpdave11/gofpdf"
	pdfbarcode "github.com/phpdave11/gofpdf/contrib/barcode"
	"github.com/ssnodgrass/race-assistant/internal/repository"
)

type ReportingService struct {
	app             core.Maroto
	db              *sql.DB
	raceRepo        *repository.RaceRepository
	eventRepo       *repository.EventRepository
	participantRepo *repository.ParticipantRepository
	timingRepo      *repository.TimingRepository
	awardService    *AwardService
	timingService   *TimingService
}

func NewReportingService(
	raceRepo *repository.RaceRepository,
	eventRepo *repository.EventRepository,
	participantRepo *repository.ParticipantRepository,
	timingRepo *repository.TimingRepository,
	awardService *AwardService,
	timingService *TimingService,
) *ReportingService {
	return &ReportingService{
		raceRepo:        raceRepo,
		eventRepo:       eventRepo,
		participantRepo: participantRepo,
		timingRepo:      timingRepo,
		awardService:    awardService,
		timingService:   timingService,
	}
}

func (s *ReportingService) SetDB(db *sql.DB) {
	s.db = db
}

type BibLabelOptions struct {
	Sheet           string  `json:"sheet"`
	Source          string  `json:"source"`
	StartBib        int     `json:"start_bib"`
	EndBib          int     `json:"end_bib"`
	StartPosition   int     `json:"start_position"`
	CustomBibs      string  `json:"custom_bibs"`
	MarginTopIn     float64 `json:"margin_top_in"`
	MarginLeftIn    float64 `json:"margin_left_in"`
	HorizontalGapIn float64 `json:"horizontal_gap_in"`
	VerticalGapIn   float64 `json:"vertical_gap_in"`
}

type bibLabelSheet struct {
	Name            string
	Columns         int
	Rows            int
	LabelWidthIn    float64
	LabelHeightIn   float64
	MarginTopIn     float64
	MarginLeftIn    float64
	HorizontalGapIn float64
	VerticalGapIn   float64
}

type bibLabelEntry struct {
	Bib   string
	Name  string
	Label string
}

func (s *ReportingService) GenerateBibLabels(raceID int, outputPath string) error {
	return s.GenerateBibLabelsWithOptions(raceID, outputPath, BibLabelOptions{
		Sheet:  "avery5160_30",
		Source: "participants",
	})
}

func (s *ReportingService) GenerateBibLabelsWithOptions(raceID int, outputPath string, options BibLabelOptions) error {
	sheet := resolveBibLabelSheet(options)
	entries, err := s.resolveBibLabelEntries(raceID, options)
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		return fmt.Errorf("no bib labels to print")
	}
	return writeBibLabelPDF(outputPath, sheet, options.StartPosition, entries)
}

func (s *ReportingService) resolveBibLabelEntries(raceID int, options BibLabelOptions) ([]bibLabelEntry, error) {
	if options.Source == "range" {
		if options.StartBib <= 0 || options.EndBib <= 0 {
			return nil, fmt.Errorf("enter a valid bib range")
		}
		if options.EndBib < options.StartBib {
			return nil, fmt.Errorf("ending bib must be greater than or equal to starting bib")
		}
		entries := make([]bibLabelEntry, 0, options.EndBib-options.StartBib+1)
		for bib := options.StartBib; bib <= options.EndBib; bib++ {
			entries = append(entries, bibLabelEntry{Bib: strconv.Itoa(bib)})
		}
		return entries, nil
	}
	if options.Source == "custom" || options.Source == "list" {
		return parseCustomBibLabelEntries(options.CustomBibs)
	}
	if options.Source == "placeholder" || options.Source == "placeholders" {
		count := options.StartBib
		if count <= 0 {
			count = 1
		}
		entries := make([]bibLabelEntry, 0, count)
		for i := 0; i < count; i++ {
			entries = append(entries, bibLabelEntry{
				Bib:   "PH",
				Label: "Placeholder",
			})
		}
		return entries, nil
	}

	participants, err := s.participantRepo.ListByRace(raceID)
	if err != nil {
		return nil, err
	}

	entries := make([]bibLabelEntry, 0, len(participants))
	for _, p := range participants {
		if p.BibNumber == "" {
			continue
		}
		entries = append(entries, bibLabelEntry{
			Bib:  p.BibNumber,
			Name: fmt.Sprintf("%s %s", p.FirstName, p.LastName),
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		left, leftErr := strconv.Atoi(entries[i].Bib)
		right, rightErr := strconv.Atoi(entries[j].Bib)
		if leftErr == nil && rightErr == nil {
			return left < right
		}
		return entries[i].Bib < entries[j].Bib
	})
	return entries, nil
}

func parseCustomBibLabelEntries(raw string) ([]bibLabelEntry, error) {
	tokens := strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r' || r == '\t' || r == ' '
	})

	entries := make([]bibLabelEntry, 0, len(tokens))
	for _, token := range tokens {
		bib := strings.TrimSpace(token)
		if bib == "" {
			continue
		}

		if strings.Count(bib, "-") == 1 {
			parts := strings.SplitN(bib, "-", 2)
			start, startErr := strconv.Atoi(strings.TrimSpace(parts[0]))
			end, endErr := strconv.Atoi(strings.TrimSpace(parts[1]))
			if startErr == nil && endErr == nil && start > 0 && end > 0 {
				step := 1
				if end < start {
					step = -1
				}
				for current := start; ; current += step {
					entries = append(entries, bibLabelEntry{Bib: strconv.Itoa(current)})
					if current == end {
						break
					}
				}
				continue
			}
		}

		entries = append(entries, bibLabelEntry{Bib: bib})
	}
	if len(entries) == 0 {
		return nil, fmt.Errorf("enter at least one bib number")
	}
	return entries, nil
}

func resolveBibLabelSheet(options BibLabelOptions) bibLabelSheet {
	sheet := bibLabelSheet{
		Name:            "Avery 5160 / 30 per sheet",
		Columns:         3,
		Rows:            10,
		LabelWidthIn:    2.625,
		LabelHeightIn:   1,
		MarginTopIn:     0.5,
		MarginLeftIn:    0.1875,
		HorizontalGapIn: 0.125,
		VerticalGapIn:   0,
	}
	if options.Sheet == "avery5161_20" {
		sheet = bibLabelSheet{
			Name:            "Avery 5161 / 20 per sheet",
			Columns:         2,
			Rows:            10,
			LabelWidthIn:    4,
			LabelHeightIn:   1,
			MarginTopIn:     0.5,
			MarginLeftIn:    0.15625,
			HorizontalGapIn: 0.1875,
			VerticalGapIn:   0,
		}
	}
	sheet.MarginTopIn = options.MarginTopIn
	sheet.MarginLeftIn = options.MarginLeftIn
	if options.HorizontalGapIn >= 0 {
		sheet.HorizontalGapIn = options.HorizontalGapIn
	}
	if options.VerticalGapIn >= 0 {
		sheet.VerticalGapIn = options.VerticalGapIn
	}
	return sheet
}

func writeBibLabelPDF(outputPath string, sheet bibLabelSheet, startPosition int, entries []bibLabelEntry) error {
	const mmPerInch = 25.4
	pdf := gofpdf.New("P", "mm", "Letter", "")
	pdf.SetAutoPageBreak(false, 0)
	pdf.SetMargins(0, 0, 0)
	pdf.AddPage()

	if startPosition < 1 {
		startPosition = 1
	}
	slotsPerPage := sheet.Columns * sheet.Rows
	if startPosition > slotsPerPage {
		startPosition = slotsPerPage
	}
	slot := startPosition - 1

	for _, entry := range entries {
		if slot > 0 && slot%slotsPerPage == 0 {
			pdf.AddPage()
		}

		pageSlot := slot % slotsPerPage
		colIndex := pageSlot % sheet.Columns
		rowIndex := pageSlot / sheet.Columns
		x := (sheet.MarginLeftIn + float64(colIndex)*(sheet.LabelWidthIn+sheet.HorizontalGapIn)) * mmPerInch
		y := (sheet.MarginTopIn + float64(rowIndex)*(sheet.LabelHeightIn+sheet.VerticalGapIn)) * mmPerInch
		w := sheet.LabelWidthIn * mmPerInch
		h := sheet.LabelHeightIn * mmPerInch

		drawBibLabel(pdf, entry, x, y, w, h)
		slot++
	}

	return pdf.OutputFileAndClose(outputPath)
}

func drawBibLabel(pdf *gofpdf.Fpdf, entry bibLabelEntry, x, y, w, h float64) {
	paddingX := 2.5
	nameHeight := 4.2
	bibHeight := 4.5
	barcodeY := y + nameHeight + 2.5
	barcodeH := h - nameHeight - bibHeight - 5.5
	if barcodeH < 8 {
		barcodeH = 8
	}

	if entry.Name != "" {
		pdf.SetFont("Helvetica", "", 7)
		pdf.SetXY(x+paddingX, y+1.5)
		pdf.CellFormat(w-paddingX*2, 3.5, entry.Name, "", 0, "C", false, 0, "")
	}

	key := pdfbarcode.RegisterCode128(pdf, entry.Bib)
	pdfbarcode.Barcode(pdf, key, x+paddingX, barcodeY, w-paddingX*2, barcodeH, false)

	pdf.SetFont("Helvetica", "B", 10)
	pdf.SetXY(x+paddingX, y+h-bibHeight-1)
	label := entry.Bib
	if entry.Label != "" {
		label = entry.Label
	}
	pdf.CellFormat(w-paddingX*2, bibHeight, label, "", 0, "C", false, 0, "")
}

func (s *ReportingService) GenerateAwardsPDF(eventID int, outputPath string) error {
	event, err := s.eventRepo.GetByID(eventID)
	if err != nil {
		return err
	}
	race, _ := s.raceRepo.GetByID(event.RaceID)
	categories, err := s.awardService.GetAwards(eventID)
	if err != nil {
		return err
	}

	m := maroto.New()
	m.AddRows(
		row.New(20).Add(
			col.New(12).Add(
				text.New(race.Name, props.Text{Size: 18, Style: fontstyle.Bold, Align: align.Center}),
				text.New(fmt.Sprintf("%s - Award Winners", event.Name), props.Text{Size: 14, Top: 10, Align: align.Center}),
			),
		),
	)

	for _, cat := range categories {
		m.AddRows(row.New(10).Add(col.New(12).Add(text.New(cat.Name, props.Text{Size: 12, Style: fontstyle.Bold, Top: 5}))))
		for i, w := range cat.Winners {
			activeTime := w.Time
			if activeTime == "" {
				activeTime = w.UnofficialTime
			}

			m.AddRows(row.New(8).Add(
				col.New(1).Add(text.New(fmt.Sprintf("%d.", i+1), props.Text{Size: 10})),
				col.New(2).Add(text.New(w.BibNumber, props.Text{Size: 10})),
				col.New(6).Add(text.New(fmt.Sprintf("%s %s", w.FirstName, w.LastName), props.Text{Size: 10})),
				col.New(3).Add(text.New(activeTime, props.Text{Size: 10, Align: align.Right})),
			))
		}
	}

	doc, err := m.Generate()
	if err != nil {
		return err
	}
	return doc.Save(outputPath)
}

func (s *ReportingService) GenerateStandingsPDF(eventID int, outputPath string) error {
	event, err := s.eventRepo.GetByID(eventID)
	if err != nil {
		return err
	}
	race, _ := s.raceRepo.GetByID(event.RaceID)
	results, err := s.timingService.GetEventResults(eventID)
	if err != nil {
		return err
	}

	m := maroto.New()
	m.AddRows(
		row.New(20).Add(
			col.New(12).Add(
				text.New(race.Name, props.Text{Size: 18, Style: fontstyle.Bold, Align: align.Center}),
				text.New(fmt.Sprintf("%s - Full Standings", event.Name), props.Text{Size: 14, Top: 10, Align: align.Center}),
			),
		),
	)

	m.AddRows(row.New(10).Add(
		col.New(1).Add(text.New("Plc", props.Text{Size: 10, Style: fontstyle.Bold})),
		col.New(1).Add(text.New("Bib", props.Text{Size: 10, Style: fontstyle.Bold})),
		col.New(5).Add(text.New("Name", props.Text{Size: 10, Style: fontstyle.Bold})),
		col.New(1).Add(text.New("G", props.Text{Size: 10, Style: fontstyle.Bold})),
		col.New(1).Add(text.New("Age", props.Text{Size: 10, Style: fontstyle.Bold})),
		col.New(3).Add(text.New("Time", props.Text{Size: 10, Style: fontstyle.Bold, Align: align.Right})),
	))

	for _, r := range results {
		activeTime := r.Time
		if activeTime == "" {
			activeTime = r.UnofficialTime
		}

		m.AddRows(row.New(8).Add(
			col.New(1).Add(text.New(fmt.Sprintf("%d", r.EventPlace), props.Text{Size: 10})),
			col.New(1).Add(text.New(r.BibNumber, props.Text{Size: 10})),
			col.New(5).Add(text.New(fmt.Sprintf("%s %s", r.FirstName, r.LastName), props.Text{Size: 10})),
			col.New(1).Add(text.New(r.Gender, props.Text{Size: 10})),
			col.New(1).Add(text.New(fmt.Sprintf("%d", r.Age), props.Text{Size: 10})),
			col.New(3).Add(text.New(activeTime, props.Text{Size: 10, Align: align.Right})),
		))
	}

	doc, err := m.Generate()
	if err != nil {
		return err
	}
	return doc.Save(outputPath)
}

func (s *ReportingService) GenerateStandingsCSV(eventID int, outputPath string) error {
	results, err := s.timingService.GetEventResults(eventID)
	if err != nil {
		return err
	}

	file, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// Header - compatible with common race systems
	writer.Write([]string{"Place", "Bib", "First Name", "Last Name", "Gender", "Age", "Time"})

	for _, r := range results {
		activeTime := r.Time
		if activeTime == "" {
			activeTime = r.UnofficialTime
		}

		writer.Write([]string{
			fmt.Sprintf("%d", r.EventPlace),
			r.BibNumber,
			r.FirstName,
			r.LastName,
			r.Gender,
			fmt.Sprintf("%d", r.Age),
			activeTime,
		})
	}

	return nil
}

func (s *ReportingService) GenerateCheckInWorksheetCSV(raceID int, outputPath string) error {
	participants, err := s.participantRepo.ListByRace(raceID)
	if err != nil {
		return err
	}

	events, err := s.eventRepo.ListByRace(raceID)
	if err != nil {
		return err
	}
	eventNames := make(map[int]string, len(events))
	for _, event := range events {
		eventNames[event.ID] = event.Name
	}

	sort.SliceStable(participants, func(i, j int) bool {
		leftEvent := eventNames[participants[i].EventID]
		rightEvent := eventNames[participants[j].EventID]
		if leftEvent != rightEvent {
			return leftEvent < rightEvent
		}
		leftName := participants[i].LastName + participants[i].FirstName
		rightName := participants[j].LastName + participants[j].FirstName
		return leftName < rightName
	})

	file, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	writer.Write([]string{"Event", "Last Name", "First Name", "Bib", "Gender", "Age", "Shirt Size", "Checked In", "Notes"})
	for _, participant := range participants {
		checkedIn := ""
		if participant.CheckedIn {
			checkedIn = "Y"
		}
		writer.Write([]string{
			eventNames[participant.EventID],
			participant.LastName,
			participant.FirstName,
			participant.BibNumber,
			participant.Gender,
			fmt.Sprintf("%d", participant.AgeOnRaceDay),
			participant.ShirtSize,
			checkedIn,
			"",
		})
	}

	for i := 0; i < 25; i++ {
		writer.Write([]string{"", "", "", "", "", "", "", "", ""})
	}

	return nil
}
