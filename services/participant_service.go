package services

import (
	"database/sql"
	"encoding/csv"
	"io"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/ssnodgrass/race-assistant/internal/repository"
	"github.com/ssnodgrass/race-assistant/models"
)

type ParticipantService struct {
	repo *repository.ParticipantRepository
}

func NewParticipantService(repo *repository.ParticipantRepository) *ParticipantService {
	return &ParticipantService{repo: repo}
}

func (s *ParticipantService) SetDB(db *sql.DB) {
	s.repo.SetDB(db)
}

func (s *ParticipantService) ListParticipants(raceID int) ([]models.Participant, error) {
	return s.repo.ListByRace(raceID)
}

func (s *ParticipantService) ListParticipantsByEvent(eventID int) ([]models.Participant, error) {
	return s.repo.ListByEvent(eventID)
}

func (s *ParticipantService) AddParticipant(p models.Participant) (models.Participant, error) {
	err := s.repo.Create(&p)
	return p, err
}

func (s *ParticipantService) UpdateParticipant(p models.Participant) error {
	return s.repo.Update(&p)
}

func (s *ParticipantService) DeleteParticipant(id int) error {
	return s.repo.Delete(id)
}

func (s *ParticipantService) GetCSVHeaders(filePath string) ([]string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	reader := csv.NewReader(f)
	return reader.Read()
}

func (s *ParticipantService) ImportParticipants(
	raceID int,
	filePath string,
	mapping map[string]int, // Key: model field name, Value: CSV column index
	startBib int,
	defaultEventID int,
	eventMap map[string]int, // Map of Event Name -> Event ID for matching
) (int, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	reader := csv.NewReader(f)
	// Skip header
	_, _ = reader.Read()

	count := 0
	currentBib := startBib

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return count, err
		}

		p := models.Participant{
			RaceID:  raceID,
			EventID: defaultEventID,
		}

		// 1. Resolve Event if mapped
		if idx, ok := mapping["event"]; ok && idx >= 0 && idx < len(record) {
			csvEventName := strings.ToLower(strings.TrimSpace(record[idx]))
			for name, id := range eventMap {
				if strings.ToLower(name) == csvEventName || strings.Contains(csvEventName, strings.ToLower(name)) {
					p.EventID = id
					break
				}
			}
		}

		// 2. Apply Other Mappings
		if idx, ok := mapping["first_name"]; ok && idx >= 0 && idx < len(record) {
			p.FirstName = strings.TrimSpace(record[idx])
		}
		if idx, ok := mapping["last_name"]; ok && idx >= 0 && idx < len(record) {
			p.LastName = strings.TrimSpace(record[idx])
		}
		if idx, ok := mapping["gender"]; ok && idx >= 0 && idx < len(record) {
			g := strings.ToUpper(strings.TrimSpace(record[idx]))
			if len(g) > 0 {
				p.Gender = g[:1]
			}
		}
		if idx, ok := mapping["age"]; ok && idx >= 0 && idx < len(record) {
			age, _ := strconv.Atoi(record[idx])
			p.AgeOnRaceDay = age
		}
		if idx, ok := mapping["dob"]; ok && idx >= 0 && idx < len(record) {
			dobStr := strings.TrimSpace(record[idx])
			if dobStr != "" {
				formats := []string{"01/02/2006", "2006-01-02", "1/2/06"}
				for _, fmtStr := range formats {
					t, err := time.Parse(fmtStr, dobStr)
					if err == nil {
						p.DOB = &t
						break
					}
				}
			}
		}
		if idx, ok := mapping["bib"]; ok && idx >= 0 && idx < len(record) {
			p.BibNumber = strings.TrimSpace(record[idx])
		}

		// Handle Bib Auto-increment if no bib provided or mapping missing
		if p.BibNumber == "" && currentBib > 0 {
			p.BibNumber = strconv.Itoa(currentBib)
			currentBib++
		}

		if p.FirstName != "" && p.LastName != "" {
			if err := s.repo.Create(&p); err == nil {
				count++
			}
		}
	}

	return count, nil
}

func (s *ParticipantService) ImportRunSignUpCSV(raceID int, eventID int, filePath string) (int, error) {
	mapping := map[string]int{"first_name": 0, "last_name": 1, "gender": 2, "age": 3, "bib": 4}
	return s.ImportParticipants(raceID, filePath, mapping, 0, eventID, nil)
}
