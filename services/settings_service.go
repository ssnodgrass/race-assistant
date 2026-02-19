package services

import (
	"database/sql"
	"github.com/ssnodgrass/race-assistant/internal/repository"
)

type SettingsService struct {
	repo *repository.SettingsRepository
}

func NewSettingsService(repo *repository.SettingsRepository) *SettingsService {
	return &SettingsService{repo: repo}
}

func (s *SettingsService) SetDB(db *sql.DB) {
	s.repo.SetDB(db)
}

func (s *SettingsService) Get(key string) (string, error) {
	return s.repo.Get(key)
}

func (s *SettingsService) Set(key, value string) error {
	return s.repo.Set(key, value)
}
