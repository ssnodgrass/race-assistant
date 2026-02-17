package services

import (
	"database/sql"
	"fmt"
	"github.com/ssnodgrass/race-assistant/internal/repository"
	"github.com/ssnodgrass/race-assistant/models"
)

type EventService struct {
	repo *repository.EventRepository
}

func NewEventService(repo *repository.EventRepository) *EventService {
	return &EventService{repo: repo}
}

func (s *EventService) SetDB(db *sql.DB) {
	s.repo.SetDB(db)
}

func (s *EventService) ListEvents(raceID int) ([]models.Event, error) {
	return s.repo.ListByRace(raceID)
}

func (s *EventService) CreateEvent(e models.Event) (models.Event, error) {
	err := s.repo.Create(&e)
	return e, err
}

func (s *EventService) UpdateEvent(e models.Event) error {
	return s.repo.Update(&e)
}

func (s *EventService) DeleteEvent(id int) error {
	has, err := s.repo.HasParticipants(id)
	if err != nil {
		return err
	}
	if has {
		return fmt.Errorf("cannot delete event: participants are still registered for it")
	}
	return s.repo.Delete(id)
}

func (s *EventService) GetAwardConfig(eventID int) (*models.AwardConfig, error) {
	return s.repo.GetAwardConfig(eventID)
}

func (s *EventService) SaveAwardConfig(config models.AwardConfig) error {
	return s.repo.UpsertAwardConfig(&config)
}
