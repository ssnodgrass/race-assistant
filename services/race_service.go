package services

import (
	"database/sql"
	"time"
	"github.com/ssnodgrass/race-assistant/internal/repository"
	"github.com/ssnodgrass/race-assistant/models"
)

type RaceService struct {
	repo *repository.RaceRepository
}

func NewRaceService(repo *repository.RaceRepository) *RaceService {
	return &RaceService{repo: repo}
}

func (s *RaceService) SetDB(db *sql.DB) {
	s.repo.SetDB(db)
}

func (s *RaceService) ListRaces() ([]models.Race, error) {
	return s.repo.List()
}

func (s *RaceService) CreateRace(race models.Race) (models.Race, error) {
	err := s.repo.Create(&race)
	return race, err
}

func (s *RaceService) UpdateRace(race models.Race) error {
	return s.repo.Update(&race)
}

func (s *RaceService) DeleteRace(id int) error {
	return s.repo.Delete(id)
}

func (s *RaceService) StartRace(id int) error {
	race, err := s.repo.GetByID(id)
	if err != nil { return err }
	
	now := time.Now()
	race.StartTime = &now
	return s.repo.Update(race)
}

func (s *RaceService) ResetRace(id int) error {
	race, err := s.repo.GetByID(id)
	if err != nil { return err }
	
	race.StartTime = nil
	return s.repo.Update(race)
}
