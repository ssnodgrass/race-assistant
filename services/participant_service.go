package services

import (
	"database/sql"
	"encoding/csv"
	"fmt"
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

func (s *ParticipantService) DeleteParticipantsByRace(raceID int) (int, error) {
	count, err := s.repo.DeleteByRace(raceID)
	return int(count), err
}

func (s *ParticipantService) ClearBibNumbersByRace(raceID int) (int, error) {
	count, err := s.repo.ClearBibNumbersByRace(raceID)
	return int(count), err
}

func (s *ParticipantService) ToggleCheckIn(id int) error {
	p, err := s.repo.GetByID(id)
	if err != nil {
		return err
	}
	p.CheckedIn = !p.CheckedIn
	return s.repo.Update(p)
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
	mapping map[string]int,
	startBib int,
	defaultEventID int,
	eventMap map[string]int,
	replaceExisting bool,
) (int, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	// Use Transaction for bulk import
	db := s.repo.GetDB()
	if db == nil {
		return 0, fmt.Errorf("no database connection")
	}
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	if replaceExisting {
		if _, err := tx.Exec("DELETE FROM participants WHERE race_id = ?", raceID); err != nil {
			return 0, err
		}
	}

	// Get existing bibs for duplicate detection
	existing := []models.Participant{}
	if !replaceExisting {
		existing, _ = s.repo.ListByRace(raceID)
	}
	existingBibs := make(map[string]bool)
	for _, ex := range existing {
		if ex.BibNumber != "" {
			existingBibs[ex.BibNumber] = true
		}
	}

	reader := csv.NewReader(f)
	_, _ = reader.Read() // Skip header

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

		// Apply Mappings
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
		if idx, ok := mapping["event"]; ok && idx >= 0 && idx < len(record) {
			csvEventName := strings.ToLower(strings.TrimSpace(record[idx]))
			for name, id := range eventMap {
				if strings.ToLower(name) == csvEventName || strings.Contains(csvEventName, strings.ToLower(name)) {
					p.EventID = id
					break
				}
			}
		}

		// Validations
		if p.FirstName == "" || p.LastName == "" {
			continue
		}

		// Duplicate Detection: ONLY Bib-based
		if p.BibNumber != "" && existingBibs[p.BibNumber] {
			continue // Skip if bib already exists
		}

		// Bib Auto-increment if missing
		if p.BibNumber == "" && currentBib > 0 {
			for {
				candidate := strconv.Itoa(currentBib)
				if !existingBibs[candidate] {
					p.BibNumber = candidate
					currentBib++
					break
				}
				currentBib++
			}
		}

		// Use manual exec on tx for performance
		_, err = tx.Exec(`INSERT INTO participants (race_id, event_id, bib_number, first_name, last_name, gender, dob, age_on_race_day, checked_in) 
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			p.RaceID, p.EventID, p.BibNumber, p.FirstName, p.LastName, p.Gender, p.DOB, p.AgeOnRaceDay, p.CheckedIn)

		if err == nil {
			count++
			if p.BibNumber != "" {
				existingBibs[p.BibNumber] = true
			}
		}
	}

	err = tx.Commit()
	return count, err
}

func (s *ParticipantService) ReassignBibs(raceID int, startBib int) error {
	participants, err := s.repo.ListByRace(raceID)
	if err != nil {
		return err
	}

	db := s.repo.GetDB()
	if db == nil {
		return fmt.Errorf("no database connection")
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	currentBib := startBib
	for i := range participants {
		_, err = tx.Exec("UPDATE participants SET bib_number = ? WHERE id = ?", strconv.Itoa(currentBib), participants[i].ID)
		if err != nil {
			return err
		}
		currentBib++
	}

	return tx.Commit()
}
