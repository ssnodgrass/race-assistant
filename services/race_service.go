package services

import (
	"database/sql"
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
