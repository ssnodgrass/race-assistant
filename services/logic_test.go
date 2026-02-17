package services

import (
	"testing"
	"time"

	"github.com/ssnodgrass/race-assistant/database"
	"github.com/ssnodgrass/race-assistant/internal/repository"
	"github.com/ssnodgrass/race-assistant/models"
)

func setupTestDB(t *testing.T) (*repository.RaceRepository, *repository.EventRepository, *repository.ParticipantRepository, *repository.TimingRepository) {
	db, err := database.Connect(":memory:")
	if err != nil {
		t.Fatalf("Failed to init in-memory DB: %v", err)
	}

	raceRepo := repository.NewRaceRepository(db)
	eventRepo := repository.NewEventRepository(db)
	partRepo := repository.NewParticipantRepository(db)
	timingRepo := repository.NewTimingRepository(db)

	return raceRepo, eventRepo, partRepo, timingRepo
}

func TestAwardCascade(t *testing.T) {
	raceRepo, eventRepo, partRepo, timingRepo := setupTestDB(t)

	race := models.Race{Name: "Test Race", Date: time.Now()}
	raceRepo.Create(&race)

	event := models.Event{RaceID: race.ID, Name: "5K", DistanceKM: 5.0}
	eventRepo.Create(&event)

	config := models.AwardConfig{
		EventID:        event.ID,
		OverallCount:   1,
		IncludeOverall: true,
		MastersAge:     40,
		MastersCount:   1,
		IncludeMasters: true,
		SplitGender:    true,
		AgeGroups:      []models.AgeGroup{{0, 39}, {40, 49}, {50, 99}},
		AgeGroupDepth:  3,
	}
	eventRepo.UpsertAwardConfig(&config)

	participants := []models.Participant{
		{RaceID: race.ID, EventID: event.ID, BibNumber: "101", FirstName: "Overall", LastName: "Winner", Gender: "M", AgeOnRaceDay: 25},
		{RaceID: race.ID, EventID: event.ID, BibNumber: "102", FirstName: "Masters", LastName: "Winner", Gender: "M", AgeOnRaceDay: 45},
		{RaceID: race.ID, EventID: event.ID, BibNumber: "103", FirstName: "AgeGroup", LastName: "Winner", Gender: "M", AgeOnRaceDay: 26},
	}
	for i := range participants {
		partRepo.Create(&participants[i])
	}

	timingRepo.CreatePulse(&models.TimingPulse{RaceID: race.ID, Place: 1, RawTime: "18:00"})
	timingRepo.CreatePulse(&models.TimingPulse{RaceID: race.ID, Place: 2, RawTime: "20:00"})
	timingRepo.CreatePulse(&models.TimingPulse{RaceID: race.ID, Place: 3, RawTime: "22:00"})

	timingRepo.UpsertChuteAssignment(&models.ChuteAssignment{RaceID: race.ID, Place: 1, BibNumber: "101"})
	timingRepo.UpsertChuteAssignment(&models.ChuteAssignment{RaceID: race.ID, Place: 2, BibNumber: "102"})
	timingRepo.UpsertChuteAssignment(&models.ChuteAssignment{RaceID: race.ID, Place: 3, BibNumber: "103"})

	awardService := NewAwardService(eventRepo, timingRepo)
	categories, err := awardService.GetAwards(event.ID)
	if err != nil {
		t.Fatalf("GetAwards failed: %v", err)
	}

	resultsMap := make(map[string]string)
	for _, cat := range categories {
		for _, winner := range cat.Winners {
			resultsMap[winner.BibNumber] = cat.Name
		}
	}

	if resultsMap["101"] != "Overall Male" {
		t.Errorf("Runner 101 expected Overall Male, got %s", resultsMap["101"])
	}
	if resultsMap["102"] != "Masters Male" {
		t.Errorf("Runner 102 expected Masters Male, got %s", resultsMap["102"])
	}
	if resultsMap["103"] != "Male 0-39" {
		t.Errorf("Runner 103 expected Male 0-39, got %s", resultsMap["103"])
	}
}

func TestSharedChuteMultiEvent(t *testing.T) {
	raceRepo, eventRepo, partRepo, timingRepo := setupTestDB(t)

	race := models.Race{Name: "Shared Race", Date: time.Now()}
	raceRepo.Create(&race)

	e5k := models.Event{RaceID: race.ID, Name: "5K", DistanceKM: 5.0}
	eventRepo.Create(&e5k)
	e10k := models.Event{RaceID: race.ID, Name: "10K", DistanceKM: 10.0}
	eventRepo.Create(&e10k)

	// 5K Runner finishes 1st overall
	// 10K Runner finishes 2nd overall (but 1st in 10K)
	partRepo.Create(&models.Participant{RaceID: race.ID, EventID: e5k.ID, BibNumber: "501", FirstName: "Fast", LastName: "5K", Gender: "M", AgeOnRaceDay: 30})
	partRepo.Create(&models.Participant{RaceID: race.ID, EventID: e10k.ID, BibNumber: "1001", FirstName: "Fast", LastName: "10K", Gender: "M", AgeOnRaceDay: 30})

	timingRepo.CreatePulse(&models.TimingPulse{RaceID: race.ID, Place: 1, RawTime: "18:00"})
	timingRepo.CreatePulse(&models.TimingPulse{RaceID: race.ID, Place: 2, RawTime: "35:00"})

	timingRepo.UpsertChuteAssignment(&models.ChuteAssignment{RaceID: race.ID, Place: 1, BibNumber: "501"})
	timingRepo.UpsertChuteAssignment(&models.ChuteAssignment{RaceID: race.ID, Place: 2, BibNumber: "1001"})

	ts := NewTimingService(timingRepo, eventRepo)

	results10k, _ := ts.GetEventResults(e10k.ID)
	if len(results10k) != 1 {
		t.Fatalf("Expected 1 10K result, got %d", len(results10k))
	}
	if results10k[0].ChutePlace != 2 {
		t.Errorf("10K runner expected ChutePlace 2, got %d", results10k[0].ChutePlace)
	}
	if results10k[0].EventPlace != 1 {
		t.Errorf("10K runner expected EventPlace 1, got %d", results10k[0].EventPlace)
	}
}

func TestPaceCalculation(t *testing.T) {
	ts := &TimingService{}

	tests := []struct {
		time     string
		dist     float64
		expected string
	}{
		{"18:00", 5.0, "3:36/km"},
		{"00:20:00", 5.0, "4:00/km"},
		{"01:00:00", 10.0, "6:00/km"},
		{"00:31:06.5", 5.0, "6:13/km"},
	}

	for _, tc := range tests {
		got := ts.calculatePace(tc.time, tc.dist)
		if got != tc.expected {
			t.Errorf("calculatePace(%s, %.1f) = %s; want %s", tc.time, tc.dist, got, tc.expected)
		}
	}
}
