package services

import (
	"database/sql"
	"fmt"

	"github.com/ssnodgrass/race-assistant/internal/repository"
	"github.com/ssnodgrass/race-assistant/models"
)

type AwardService struct {
	eventRepo  *repository.EventRepository
	timingRepo *repository.TimingRepository
}

func NewAwardService(eventRepo *repository.EventRepository, timingRepo *repository.TimingRepository) *AwardService {
	return &AwardService{eventRepo: eventRepo, timingRepo: timingRepo}
}

func (s *AwardService) SetDB(db *sql.DB) {
	s.eventRepo.SetDB(db)
	s.timingRepo.SetDB(db)
}

type AwardCategory struct {
	Name    string          `json:"name"`
	Winners []models.Result `json:"winners"`
}

func (s *AwardService) GetAwards(eventID int) ([]AwardCategory, error) {
	config, err := s.eventRepo.GetAwardConfig(eventID)
	if err != nil {
		return nil, err
	}

	results, err := s.timingRepo.GetReconciledResultsByEvent(eventID)
	if err != nil {
		return nil, err
	}

	for i := range results {
		results[i].EventPlace = i + 1
	}

	claimed := make(map[string]bool)
	var categories []AwardCategory

	getWinners := func(name string, count int, filter func(models.Result) bool) {
		if count <= 0 {
			return
		}
		cat := AwardCategory{Name: name}
		found := 0
		for _, r := range results {
			if claimed[r.BibNumber] {
				continue
			}
			if filter(r) {
				r.Category = name
				cat.Winners = append(cat.Winners, r)
				claimed[r.BibNumber] = true
				found++
				if found >= count {
					break
				}
			}
		}
		if len(cat.Winners) > 0 {
			categories = append(categories, cat)
		}
	}

	// 1. Overall
	if config.IncludeOverall {
		if config.SplitGender {
			getWinners("Overall Male", config.OverallCount, func(r models.Result) bool { return r.Gender == "M" })
			getWinners("Overall Female", config.OverallCount, func(r models.Result) bool { return r.Gender == "F" })
		} else {
			getWinners("Overall", config.OverallCount, func(r models.Result) bool { return true })
		}
	}

	// 2. Masters Cascade (Strategy Dependent)
	type masterDef struct {
		name    string
		age     int
		count   int
		include bool
	}

	mDefs := []masterDef{
		{"Masters", config.MastersAge, config.MastersCount, config.IncludeMasters},
		{"Grand Masters", config.GrandMastersAge, config.GrandMastersCount, config.IncludeGrandMasters},
		{"Senior Grand Masters", config.SeniorGrandMastersAge, config.SeniorGrandMastersCount, config.IncludeSeniorGrandMasters},
	}

	// If Distributed strategy is used, reverse the order to give more specific awards first
	if config.AwardStrategy == models.AwardStrategyDistributed {
		for i, j := 0, len(mDefs)-1; i < j; i, j = i+1, j-1 {
			mDefs[i], mDefs[j] = mDefs[j], mDefs[i]
		}
	}

	for _, m := range mDefs {
		if !m.include {
			continue
		}
		if config.SplitGender {
			getWinners(m.name+" Male", m.count, func(r models.Result) bool { return r.Gender == "M" && r.Age >= m.age })
			getWinners(m.name+" Female", m.count, func(r models.Result) bool { return r.Gender == "F" && r.Age >= m.age })
		} else {
			getWinners(m.name, m.count, func(r models.Result) bool { return r.Age >= m.age })
		}
	}

	// 3. Age Groups (Granular)
	for _, ag := range config.AgeGroups {
		label := fmt.Sprintf("%d-%d", ag.Min, ag.Max)
		if ag.Max >= 99 {
			label = fmt.Sprintf("%d+", ag.Min)
		}

		if config.SplitGender {
			getWinners("Male "+label, config.AgeGroupDepth, func(r models.Result) bool {
				return r.Gender == "M" && r.Age >= ag.Min && r.Age <= ag.Max
			})
			getWinners("Female "+label, config.AgeGroupDepth, func(r models.Result) bool {
				return r.Gender == "F" && r.Age >= ag.Min && r.Age <= ag.Max
			})
		} else {
			getWinners(label, config.AgeGroupDepth, func(r models.Result) bool {
				return r.Age >= ag.Min && r.Age <= ag.Max
			})
		}
	}

	return categories, nil
}
