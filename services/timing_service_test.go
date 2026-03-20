package services

import (
	"testing"
	"time"

	"github.com/ssnodgrass/race-assistant/models"
)

func TestDeleteAllPlacementsByEvent(t *testing.T) {
	raceRepo, eventRepo, partRepo, timingRepo := setupTestDB(t)

	race := models.Race{Name: "Placement Delete Test", Date: time.Now()}
	if err := raceRepo.Create(&race); err != nil {
		t.Fatalf("Create race failed: %v", err)
	}

	eventA := models.Event{RaceID: race.ID, Name: "5K", DistanceKM: 5}
	if err := eventRepo.Create(&eventA); err != nil {
		t.Fatalf("Create eventA failed: %v", err)
	}

	eventB := models.Event{RaceID: race.ID, Name: "10K", DistanceKM: 10}
	if err := eventRepo.Create(&eventB); err != nil {
		t.Fatalf("Create eventB failed: %v", err)
	}

	for _, participant := range []models.Participant{
		{RaceID: race.ID, EventID: eventA.ID, BibNumber: "101", FirstName: "Alice", LastName: "A", Gender: "F", AgeOnRaceDay: 30},
		{RaceID: race.ID, EventID: eventB.ID, BibNumber: "201", FirstName: "Bob", LastName: "B", Gender: "M", AgeOnRaceDay: 35},
	} {
		p := participant
		if err := partRepo.Create(&p); err != nil {
			t.Fatalf("Create participant failed: %v", err)
		}
	}

	ts := NewTimingService(timingRepo, eventRepo)

	if err := ts.AssignBibToPlaceForEvent(race.ID, eventA.ID, 1, "101"); err != nil {
		t.Fatalf("AssignBibToPlaceForEvent eventA failed: %v", err)
	}
	if err := ts.AssignBibToPlaceForEvent(race.ID, eventB.ID, 1, "201"); err != nil {
		t.Fatalf("AssignBibToPlaceForEvent eventB failed: %v", err)
	}

	if err := ts.DeleteAllPlacements(race.ID, eventA.ID); err != nil {
		t.Fatalf("DeleteAllPlacements failed: %v", err)
	}

	eventAPlacements, err := ts.ListPlacementsByEvent(race.ID, eventA.ID)
	if err != nil {
		t.Fatalf("ListPlacementsByEvent eventA failed: %v", err)
	}
	if len(eventAPlacements) != 0 {
		t.Fatalf("expected 0 placements for eventA after delete, got %d", len(eventAPlacements))
	}

	eventBPlacements, err := ts.ListPlacementsByEvent(race.ID, eventB.ID)
	if err != nil {
		t.Fatalf("ListPlacementsByEvent eventB failed: %v", err)
	}
	if len(eventBPlacements) != 1 {
		t.Fatalf("expected eventB placements to remain, got %d", len(eventBPlacements))
	}
}
