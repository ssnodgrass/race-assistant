package services

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"os"

	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/code"
	"github.com/johnfercher/maroto/v2/pkg/components/col"
	"github.com/johnfercher/maroto/v2/pkg/components/row"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/config"
	"github.com/johnfercher/maroto/v2/pkg/consts/align"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/consts/pagesize"
	"github.com/johnfercher/maroto/v2/pkg/core"
	"github.com/johnfercher/maroto/v2/pkg/props"
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

func (s *ReportingService) GenerateBibLabels(raceID int, outputPath string) error {
	participants, err := s.participantRepo.ListByRace(raceID)
	if err != nil {
		return err
	}

	cfg := config.NewBuilder().
		WithPageSize(pagesize.Letter).
		WithLeftMargin(4.8).
		WithTopMargin(12.7).
		WithRightMargin(4.8).
		WithBottomMargin(12.7). 
		Build()

	m := maroto.New(cfg)

	var rows []core.Row
	for i := 0; i < len(participants); i += 3 {
		var cols []core.Col
		for j := 0; j < 3; j++ {
			if i+j < len(participants) {
				p := participants[i+j]
				cols = append(cols, col.New(4).Add(
					text.New(fmt.Sprintf("%s %s", p.FirstName, p.LastName), props.Text{
						Size:  7,
						Align: align.Center,
						Top:   3,
					}),
					code.NewBar(p.BibNumber, props.Barcode{
						Center:  true,
						Percent: 60,
						Top:     8,
					}),
					text.New(p.BibNumber, props.Text{
						Size:  9,
						Style: fontstyle.Bold,
						Align: align.Center,
						Top:   18,
					}),
				))
			} else {
				cols = append(cols, col.New(4))
			}
		}
		rows = append(rows, row.New(25.3).Add(cols...))
	}

	m.AddRows(rows...)
	doc, err := m.Generate()
	if err != nil {
		return err
	}
	return doc.Save(outputPath)
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
			if activeTime == "" { activeTime = w.UnofficialTime }
			
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
		if activeTime == "" { activeTime = r.UnofficialTime }

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
