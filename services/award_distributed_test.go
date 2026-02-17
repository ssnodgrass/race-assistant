package services

import (
	"testing"
	"time"

	"github.com/ssnodgrass/race-assistant/models"
)

func TestAwardStrategyDistributed(t *testing.T) {
	raceRepo, eventRepo, partRepo, timingRepo := setupTestDB(t)
	race := models.Race{Name: "Distributed Race", Date: time.Now()}
	raceRepo.Create(&race)
	event := models.Event{RaceID: race.ID, Name: "10K", DistanceKM: 10.0}
	eventRepo.Create(&event)

	// Config: Distributed Strategy
	// 1 Overall, 1 Masters (40+), 1 Senior Grand (60+)
	config := models.AwardConfig{
		EventID:                   event.ID,
		OverallCount:              1,
		IncludeOverall:            true,
		MastersAge:                40,
		MastersCount:              1,
		IncludeMasters:            true,
		SeniorGrandMastersAge:     60,
		SeniorGrandMastersCount:   1,
		IncludeSeniorGrandMasters: true,
		SplitGender:               true,
		AwardStrategy:             models.AwardStrategyDistributed,
		AgeGroupDepth:             1,
		AgeGroups:                 []models.AgeGroup{{0, 99}},
	}
	eventRepo.UpsertAwardConfig(&config)

	// Runner 1: 65yo Male (Wins Senior Grand because it's checked first in Distributed)
	// Runner 2: 45yo Male (Wins Masters because 65yo already took Senior)
	partRepo.Create(&models.Participant{RaceID: race.ID, EventID: event.ID, BibNumber: "M65", Gender: "M", AgeOnRaceDay: 65, FirstName: "Old", LastName: "Man"})
	partRepo.Create(&models.Participant{RaceID: race.ID, EventID: event.ID, BibNumber: "M45", Gender: "M", AgeOnRaceDay: 45, FirstName: "Young", LastName: "Man"})

	// Also add a 25yo to take Overall so the Masters logic triggers
	partRepo.Create(&models.Participant{RaceID: race.ID, EventID: event.ID, BibNumber: "M25", Gender: "M", AgeOnRaceDay: 25, FirstName: "Fast", LastName: "Kid"})

	timingRepo.CreatePulse(&models.TimingPulse{RaceID: race.ID, Place: 1, RawTime: "18:00"})
	timingRepo.UpsertChuteAssignment(&models.ChuteAssignment{RaceID: race.ID, Place: 1, BibNumber: "M25"})
	timingRepo.CreatePulse(&models.TimingPulse{RaceID: race.ID, Place: 2, RawTime: "19:00"})
	timingRepo.UpsertChuteAssignment(&models.ChuteAssignment{RaceID: race.ID, Place: 2, BibNumber: "M65"})
	timingRepo.CreatePulse(&models.TimingPulse{RaceID: race.ID, Place: 3, RawTime: "20:00"})
	timingRepo.UpsertChuteAssignment(&models.ChuteAssignment{RaceID: race.ID, Place: 3, BibNumber: "M45"})

	awardService := NewAwardService(eventRepo, timingRepo)
	categories, _ := awardService.GetAwards(event.ID)

	resultsMap := make(map[string]string)
	for _, cat := range categories {
		for _, winner := range cat.Winners {
			resultsMap[winner.BibNumber] = cat.Name
		}
	}

	// In Distributed mode:
	// M25 -> Overall
	// M65 -> Senior Grand (even though he's faster than M45, we give him the specific one first)
	// M45 -> Masters (is the next fastest 40+ remaining)

	if resultsMap["M65"] != "Senior Grand Masters Male" {
		t.Errorf("Bib M65 should be Senior Grand Masters Male (Distributed), got %s", resultsMap["M65"])
	}
	if resultsMap["M45"] != "Masters Male" {
		t.Errorf("Bib M45 should be Masters Male (Distributed), got %s", resultsMap["M45"])
	}
}
