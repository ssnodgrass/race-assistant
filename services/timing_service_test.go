package services

import (
	"strings"
	"testing"
	"time"

	"github.com/ssnodgrass/race-assistant/models"
)

func TestAssignBibDoesNotImplicitlyMoveExistingPlacement(t *testing.T) {
	raceRepo, eventRepo, partRepo, timingRepo := setupTestDB(t)
	race := models.Race{Name: "Duplicate Placement Test", Date: time.Now()}
	if err := raceRepo.Create(&race); err != nil {
		t.Fatal(err)
	}
	event := models.Event{RaceID: race.ID, Name: "5K", DistanceKM: 5}
	if err := eventRepo.Create(&event); err != nil {
		t.Fatal(err)
	}
	participant := models.Participant{RaceID: race.ID, EventID: event.ID, BibNumber: "111", FirstName: "Duplicate", LastName: "Runner", Gender: "M", AgeOnRaceDay: 30}
	if err := partRepo.Create(&participant); err != nil {
		t.Fatal(err)
	}
	timing := NewTimingService(timingRepo, eventRepo)
	if err := timing.AssignBibToPlaceForEvent(race.ID, event.ID, 1, "111"); err != nil {
		t.Fatal(err)
	}
	if err := timing.AssignBibToPlaceForEvent(race.ID, event.ID, 7, "111"); err == nil || !strings.Contains(err.Error(), "already assigned to place 1") {
		t.Fatalf("expected implicit move to be rejected, got %v", err)
	}
	if err := timing.AssignBibToPlaceForEvent(race.ID, event.ID, 7, "DUP:111"); err != nil {
		t.Fatalf("duplicate marker should preserve the extra finish: %v", err)
	}
	placements, err := timing.ListPlacementsByEvent(race.ID, event.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(placements) != 2 || placements[0].Place != 1 || placements[0].BibNumber != "111" || placements[1].Place != 7 || placements[1].BibNumber != "DUP:111" {
		t.Fatalf("duplicate assignment changed the original placement: %+v", placements)
	}
}

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
