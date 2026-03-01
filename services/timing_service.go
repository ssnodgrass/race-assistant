package services

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/ssnodgrass/race-assistant/internal/repository"
	"github.com/ssnodgrass/race-assistant/models"
)

type TimingService struct {
	repo      *repository.TimingRepository
	eventRepo *repository.EventRepository
}

func NewTimingService(repo *repository.TimingRepository, eventRepo *repository.EventRepository) *TimingService {
	return &TimingService{repo: repo, eventRepo: eventRepo}
}

func (s *TimingService) SetDB(db *sql.DB) {
	s.repo.SetDB(db)
	s.eventRepo.SetDB(db)
}

func (s *TimingService) AddTimingPulse(raceID int, place int, rawTime string) (models.TimingPulse, error) {
	tp := models.TimingPulse{RaceID: raceID, EventID: 0, Place: place, RawTime: rawTime}
	err := s.repo.CreatePulse(&tp)
	return tp, err
}

func (s *TimingService) AddTimingPulseForEvent(raceID int, eventID int, place int, rawTime string) (models.TimingPulse, error) {
	tp := models.TimingPulse{RaceID: raceID, EventID: eventID, Place: place, RawTime: rawTime}
	err := s.repo.CreatePulse(&tp)
	return tp, err
}

func (s *TimingService) UpdateTimingPulse(p models.TimingPulse) error {
	return s.repo.UpdatePulse(&p)
}

func (s *TimingService) DeleteTimingPulse(id int) error {
	return s.repo.DeletePulse(id)
}

func (s *TimingService) ListTimingPulses(raceID int) ([]models.TimingPulse, error) {
	return s.repo.ListPulses(raceID)
}

func (s *TimingService) ListTimingPulsesByEvent(raceID int, eventID int) ([]models.TimingPulse, error) {
	return s.repo.ListPulsesByEvent(raceID, eventID)
}

func (s *TimingService) DeleteAllTimingPulses(raceID int, eventID int) error {
	return s.repo.DeletePulses(raceID, eventID)
}

func (s *TimingService) GetBibAssignment(raceID int, bibNumber string) (int, error) {
	return s.repo.GetBibAssignment(raceID, bibNumber)
}

func (s *TimingService) AssignBibToPlace(raceID int, place int, bibNumber string) error {
	return s.AssignBibToPlaceForEvent(raceID, 0, place, bibNumber)
}

func (s *TimingService) AssignBibToPlaceForEvent(raceID int, eventID int, place int, bibNumber string) error {
	if bibNumber != "?" && bibNumber != "" {
		s.repo.DeleteBibAssignment(raceID, bibNumber)
	}

	ca := models.ChuteAssignment{RaceID: raceID, EventID: eventID, Place: place, BibNumber: bibNumber}
	return s.repo.UpsertChuteAssignment(&ca)
}

func (s *TimingService) AssignBibToPlaceWithTime(raceID int, place int, bibNumber string, unofficialTime string) error {
	return s.AssignBibToPlaceWithTimeForEvent(raceID, 0, place, bibNumber, unofficialTime)
}

func (s *TimingService) AssignBibToPlaceWithTimeForEvent(raceID int, eventID int, place int, bibNumber string, unofficialTime string) error {
	if bibNumber != "?" && bibNumber != "" {
		s.repo.DeleteBibAssignment(raceID, bibNumber)
	}

	ca := models.ChuteAssignment{
		RaceID:         raceID,
		EventID:        eventID,
		Place:          place,
		BibNumber:      bibNumber,
		UnofficialTime: unofficialTime,
	}
	return s.repo.UpsertChuteAssignment(&ca)
}

func (s *TimingService) ShiftPlacements(raceID int, startPlace int, delta int) error {
	return s.repo.ShiftPlacements(raceID, startPlace, delta)
}

func (s *TimingService) ShiftPlacementsForEvent(raceID int, eventID int, startPlace int, delta int) error {
	return s.repo.ShiftPlacementsByEvent(raceID, eventID, startPlace, delta)
}

func (s *TimingService) InsertPlacementGap(raceID int, place int) error {
	if err := s.repo.ShiftPlacements(raceID, place, 1); err != nil {
		return err
	}
	return s.AssignBibToPlace(raceID, place, "?")
}

func (s *TimingService) DeletePlacement(raceID, place int) error {
	return s.repo.DeleteChuteAssignment(raceID, place)
}

func (s *TimingService) ListPlacements(raceID int) ([]models.ChuteAssignment, error) {
	return s.repo.ListPlacements(raceID)
}

func (s *TimingService) DeletePlacementForEvent(raceID, eventID, place int) error {
	return s.repo.DeleteChuteAssignmentByEvent(raceID, eventID, place)
}

func (s *TimingService) ListPlacementsByEvent(raceID, eventID int) ([]models.ChuteAssignment, error) {
	return s.repo.ListPlacementsByEvent(raceID, eventID)
}

func (s *TimingService) ImportPlacementsCSV(raceID int, filePath string) (int, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	reader := csv.NewReader(f)
	count := 0
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return count, err
		}

		var place int
		var bib string

		if len(record) >= 2 {
			p, _ := strconv.Atoi(record[0])
			place = p
			bib = record[1]
		} else if len(record) == 1 {
			count++
			place = count
			bib = record[0]
		}

		if bib != "" && place > 0 {
			err = s.AssignBibToPlace(raceID, place, bib)
			if err == nil {
				count++
			}
		}
	}
	return count, nil
}

func (s *TimingService) GetEventResults(eventID int) ([]models.Result, error) {
	event, err := s.eventRepo.GetByID(eventID)
	if err != nil {
		return nil, err
	}

	results, err := s.repo.GetReconciledResultsByEvent(eventID)
	if err != nil {
		return nil, err
	}

	for i := range results {
		results[i].EventPlace = i + 1
		// Use official time if present, otherwise fallback to captured unofficial time for pace
		activeTime := results[i].Time
		if activeTime == "" {
			activeTime = results[i].UnofficialTime
		}

		results[i].Pace = s.calculatePace(activeTime, event.DistanceKM)
	}
	return results, nil
}

func (s *TimingService) calculatePace(timeStr string, distanceKM float64) string {
	if distanceKM <= 0 || timeStr == "" {
		return "0:00/mi"
	}

	distanceMiles := distanceKM * 0.621371

	parts := strings.Split(timeStr, ":")
	var totalSeconds float64
	if len(parts) == 3 {
		h := s.parseFloat(parts[0])
		m := s.parseFloat(parts[1])
		s := s.parseFloat(parts[2])
		totalSeconds = h*3600 + m*60 + s
	} else if len(parts) == 2 {
		m := s.parseFloat(parts[0])
		s := s.parseFloat(parts[1])
		totalSeconds = m*60 + s
	} else {
		return "0:00/mi"
	}

	secondsPerMile := int(totalSeconds / distanceMiles)
	min := secondsPerMile / 60
	sec := secondsPerMile % 60
	return fmt.Sprintf("%d:%02d/mi", min, sec)
}

func (s *TimingService) parseFloat(val string) float64 {
	var f float64
	fmt.Sscanf(val, "%f", &f)
	return f
}
