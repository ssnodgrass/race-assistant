package services

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/ssnodgrass/race-assistant/internal/repository"
	"github.com/ssnodgrass/race-assistant/models"
)

func setupParticipantServiceTest(t *testing.T) (*ParticipantService, *repository.RaceRepository, *repository.EventRepository, *repository.ParticipantRepository) {
	raceRepo, eventRepo, partRepo, _ := setupTestDB(t)
	service := NewParticipantService(partRepo)
	return service, raceRepo, eventRepo, partRepo
}

func TestDeleteParticipantsByRace(t *testing.T) {
	service, raceRepo, eventRepo, partRepo := setupParticipantServiceTest(t)

	race := models.Race{Name: "Delete Test", Date: time.Now()}
	if err := raceRepo.Create(&race); err != nil {
		t.Fatalf("Create race failed: %v", err)
	}

	event := models.Event{RaceID: race.ID, Name: "5K", DistanceKM: 5}
	if err := eventRepo.Create(&event); err != nil {
		t.Fatalf("Create event failed: %v", err)
	}

	for _, bib := range []string{"101", "102"} {
		if err := partRepo.Create(&models.Participant{
			RaceID:       race.ID,
			EventID:      event.ID,
			BibNumber:    bib,
			FirstName:    "Runner",
			LastName:     bib,
			Gender:       "M",
			AgeOnRaceDay: 30,
		}); err != nil {
			t.Fatalf("Create participant failed: %v", err)
		}
	}

	count, err := service.DeleteParticipantsByRace(race.ID)
	if err != nil {
		t.Fatalf("DeleteParticipantsByRace failed: %v", err)
	}
	if count != 2 {
		t.Fatalf("DeleteParticipantsByRace deleted %d participants, want 2", count)
	}

	participants, err := service.ListParticipants(race.ID)
	if err != nil {
		t.Fatalf("ListParticipants failed: %v", err)
	}
	if len(participants) != 0 {
		t.Fatalf("ListParticipants returned %d participants after delete, want 0", len(participants))
	}
}

func TestImportParticipantsReplaceExisting(t *testing.T) {
	service, raceRepo, eventRepo, partRepo := setupParticipantServiceTest(t)

	race := models.Race{Name: "Import Replace Test", Date: time.Now()}
	if err := raceRepo.Create(&race); err != nil {
		t.Fatalf("Create race failed: %v", err)
	}

	event := models.Event{RaceID: race.ID, Name: "5K", DistanceKM: 5}
	if err := eventRepo.Create(&event); err != nil {
		t.Fatalf("Create event failed: %v", err)
	}

	if err := partRepo.Create(&models.Participant{
		RaceID:       race.ID,
		EventID:      event.ID,
		BibNumber:    "999",
		FirstName:    "Existing",
		LastName:     "Runner",
		Gender:       "F",
		AgeOnRaceDay: 40,
	}); err != nil {
		t.Fatalf("Create participant failed: %v", err)
	}

	tempDir := t.TempDir()
	filePath := filepath.Join(tempDir, "participants.csv")
	csvContent := "First Name,Last Name,Gender,Age,Bib\nAlice,Smith,F,28,101\nBob,Jones,M,34,102\n"
	if err := os.WriteFile(filePath, []byte(csvContent), 0o600); err != nil {
		t.Fatalf("Write CSV failed: %v", err)
	}

	count, err := service.ImportParticipants(
		race.ID,
		filePath,
		map[string]int{
			"first_name": 0,
			"last_name":  1,
			"gender":     2,
			"age":        3,
			"bib":        4,
		},
		0,
		event.ID,
		map[string]int{"5K": event.ID},
		true,
	)
	if err != nil {
		t.Fatalf("ImportParticipants failed: %v", err)
	}
	if count != 2 {
		t.Fatalf("ImportParticipants imported %d participants, want 2", count)
	}

	participants, err := service.ListParticipants(race.ID)
	if err != nil {
		t.Fatalf("ListParticipants failed: %v", err)
	}
	if len(participants) != 2 {
		t.Fatalf("ListParticipants returned %d participants, want 2", len(participants))
	}

	for _, participant := range participants {
		if participant.BibNumber == "999" {
			t.Fatalf("found stale participant after replace import")
		}
	}
}
