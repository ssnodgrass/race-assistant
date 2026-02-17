package services

import (
	"fmt"
	"testing"
	"time"

	"github.com/ssnodgrass/race-assistant/models"
)

func TestFullAwardCascadeStress(t *testing.T) {
	raceRepo, eventRepo, partRepo, timingRepo := setupTestDB(t)

	race := models.Race{Name: "Championship Race", Date: time.Now()}
	raceRepo.Create(&race)

	event := models.Event{RaceID: race.ID, Name: "10K", DistanceKM: 10.0}
	eventRepo.Create(&event)

	// Config: 1 Overall, 1 Masters (40+), 1 Grand (50+), 1 Senior (60+), 2 per Age Group
	config := models.AwardConfig{
		EventID:                   event.ID,
		OverallCount:              1,
		IncludeOverall:            true,
		MastersAge:                40,
		MastersCount:              1,
		IncludeMasters:            true,
		GrandMastersAge:           50,
		GrandMastersCount:         1,
		IncludeGrandMasters:       true,
		SeniorGrandMastersAge:     60,
		SeniorGrandMastersCount:   1,
		IncludeSeniorGrandMasters: true,
		SplitGender:               true,
		AgeGroupDepth:             2,
		AgeGroups: []models.AgeGroup{
			{0, 39}, {40, 49}, {50, 59}, {60, 99},
		},
	}
	eventRepo.UpsertAwardConfig(&config)

	// The Field (Sorted by Finish Time)
	// 1. M, 62yo -> Wins Overall Male (Disqualified from Senior/Masters/AgeGroup)
	// 2. M, 65yo -> Wins Senior Grand Masters (Disqualified from Masters/AgeGroup)
	// 3. M, 52yo -> Wins Grand Masters (Disqualified from Masters/AgeGroup)
	// 4. M, 41yo -> Wins Masters (Disqualified from AgeGroup)
	// 5. M, 25yo -> Wins 1st Male 0-39
	// 6. F, 22yo -> Wins Overall Female
	// 7. F, 42yo -> Wins Masters Female
	// 8. F, 43yo -> Wins 1st Female 40-49
	// 9. M, 30yo -> Wins 2nd Male 0-39
	// 10. M, 61yo -> Wins 1st Male 60+ (Since Bib 1 & 2 were claimed)

	runners := []models.Participant{
		{BibNumber: "M62", Gender: "M", AgeOnRaceDay: 62},
		{BibNumber: "M65", Gender: "M", AgeOnRaceDay: 65},
		{BibNumber: "M52", Gender: "M", AgeOnRaceDay: 52},
		{BibNumber: "M41", Gender: "M", AgeOnRaceDay: 41},
		{BibNumber: "M25", Gender: "M", AgeOnRaceDay: 25},
		{BibNumber: "F22", Gender: "F", AgeOnRaceDay: 22},
		{BibNumber: "F42", Gender: "F", AgeOnRaceDay: 42},
		{BibNumber: "F43", Gender: "F", AgeOnRaceDay: 43},
		{BibNumber: "M30", Gender: "M", AgeOnRaceDay: 30},
		{BibNumber: "M61", Gender: "M", AgeOnRaceDay: 61},
	}

	for i := range runners {
		runners[i].RaceID = race.ID
		runners[i].EventID = event.ID
		runners[i].FirstName = "Runner"
		runners[i].LastName = runners[i].BibNumber
		partRepo.Create(&runners[i])

		place := i + 1
		tm := fmt.Sprintf("00:%d:00", 30+i)
		timingRepo.CreatePulse(&models.TimingPulse{RaceID: race.ID, Place: place, RawTime: tm})
		timingRepo.UpsertChuteAssignment(&models.ChuteAssignment{RaceID: race.ID, Place: place, BibNumber: runners[i].BibNumber})
	}

	awardService := NewAwardService(eventRepo, timingRepo)
	categories, _ := awardService.GetAwards(event.ID)

	resultsMap := make(map[string]string)
	for _, cat := range categories {
		for _, winner := range cat.Winners {
			resultsMap[winner.BibNumber] = cat.Name
		}
	}

		expected := map[string]string{

			"M62":  "Overall Male",

			"M65":  "Masters Male",             // Fastest 40+ (after Overall)

			"M52":  "Grand Masters Male",       // Fastest 50+ (after Masters)

			"M41":  "Male 40-49",               // 1st in Age Group (M65 took Masters)

			"M25":  "Male 0-39",                // 1st in Age Group

			"F22":  "Overall Female",

			"F42":  "Masters Female",           // Fastest 40+ Female

			"F43":  "Female 40-49",             // 1st in Age Group (F42 took Masters)

			"M30":  "Male 0-39",                // 2nd in Age Group

			"M61":  "Senior Grand Masters Male",// Fastest 60+ (after Overall and Masters/Grand were taken)

		}

	for bib, catName := range expected {
		if resultsMap[bib] != catName {
			t.Errorf("Bib %s expected %s, got %s", bib, catName, resultsMap[bib])
		}
	}
}

func TestAwardCascadeOverlap(t *testing.T) {
	// Tests that if Overall is disabled, Masters becomes top priority
	raceRepo, eventRepo, partRepo, timingRepo := setupTestDB(t)
	race := models.Race{Name: "No Overall Race", Date: time.Now()}
	raceRepo.Create(&race)
	event := models.Event{RaceID: race.ID, Name: "Masters Only", DistanceKM: 5.0}
	eventRepo.Create(&event)

	config := models.AwardConfig{
		EventID:        event.ID,
		IncludeOverall: false,
		MastersAge:     40,
		MastersCount:   1,
		IncludeMasters: true,
		SplitGender:    true,
		AgeGroupDepth:  1,
		AgeGroups:      []models.AgeGroup{{40, 99}},
	}
	eventRepo.UpsertAwardConfig(&config)

	// Bib 1: 45yo Male, Time 18:00
	// Bib 2: 46yo Male, Time 19:00
	partRepo.Create(&models.Participant{RaceID: race.ID, EventID: event.ID, BibNumber: "M45", Gender: "M", AgeOnRaceDay: 45, FirstName: "A", LastName: "B"})
	partRepo.Create(&models.Participant{RaceID: race.ID, EventID: event.ID, BibNumber: "M46", Gender: "M", AgeOnRaceDay: 46, FirstName: "C", LastName: "D"})

	timingRepo.CreatePulse(&models.TimingPulse{RaceID: race.ID, Place: 1, RawTime: "18:00"})
	timingRepo.UpsertChuteAssignment(&models.ChuteAssignment{RaceID: race.ID, Place: 1, BibNumber: "M45"})
	timingRepo.CreatePulse(&models.TimingPulse{RaceID: race.ID, Place: 2, RawTime: "19:00"})
	timingRepo.UpsertChuteAssignment(&models.ChuteAssignment{RaceID: race.ID, Place: 2, BibNumber: "M46"})

	awardService := NewAwardService(eventRepo, timingRepo)
	categories, _ := awardService.GetAwards(event.ID)

	resultsMap := make(map[string]string)
	for _, cat := range categories {
		for _, winner := range cat.Winners {
			resultsMap[winner.BibNumber] = cat.Name
		}
	}

	if resultsMap["M45"] != "Masters Male" {
		t.Errorf("Bib M45 should be Masters Male since Overall is disabled, got %s", resultsMap["M45"])
	}
	if resultsMap["M46"] != "Male 40+" {
		t.Errorf("Bib M46 should win Age Group 40+ since M45 took Masters, got %s", resultsMap["M46"])
	}
}
