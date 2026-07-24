package services

import (
	"encoding/csv"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/ssnodgrass/race-assistant/models"
)

func TestParseCustomBibLabelEntries(t *testing.T) {
	entries, err := parseCustomBibLabelEntries("1502-1504, 1433\n1098 1083")
	if err != nil {
		t.Fatalf("parseCustomBibLabelEntries returned error: %v", err)
	}

	got := make([]string, 0, len(entries))
	for _, entry := range entries {
		got = append(got, entry.Bib)
	}
	want := []string{"1502", "1503", "1504", "1433", "1098", "1083"}
	if len(got) != len(want) {
		t.Fatalf("got %d entries, want %d: %v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("entry %d = %q, want %q; all entries: %v", i, got[i], want[i], got)
		}
	}
}

func TestParseCustomBibLabelEntriesRequiresBib(t *testing.T) {
	if _, err := parseCustomBibLabelEntries(" , \n "); err == nil {
		t.Fatal("parseCustomBibLabelEntries returned nil error for empty list")
	}
}

func TestGenerateCheckInWorksheetIncludesShirtSize(t *testing.T) {
	raceRepo, eventRepo, participantRepo, _ := setupTestDB(t)
	race := models.Race{Name: "Shirt Test", Date: time.Now()}
	if err := raceRepo.Create(&race); err != nil {
		t.Fatalf("Create race failed: %v", err)
	}
	event := models.Event{RaceID: race.ID, Name: "5K", DistanceKM: 5}
	if err := eventRepo.Create(&event); err != nil {
		t.Fatalf("Create event failed: %v", err)
	}
	participant := models.Participant{
		RaceID:       race.ID,
		EventID:      event.ID,
		BibNumber:    "101",
		FirstName:    "Alice",
		LastName:     "Smith",
		Gender:       "F",
		AgeOnRaceDay: 28,
		ShirtSize:    "Adult M",
	}
	if err := participantRepo.Create(&participant); err != nil {
		t.Fatalf("Create participant failed: %v", err)
	}

	path := filepath.Join(t.TempDir(), "check-in.csv")
	service := NewReportingService(raceRepo, eventRepo, participantRepo, nil, nil, nil)
	if err := service.GenerateCheckInWorksheetCSV(race.ID, path); err != nil {
		t.Fatalf("GenerateCheckInWorksheetCSV failed: %v", err)
	}

	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("Open worksheet failed: %v", err)
	}
	defer file.Close()
	rows, err := csv.NewReader(file).ReadAll()
	if err != nil {
		t.Fatalf("Read worksheet failed: %v", err)
	}
	if got, want := rows[0][6], "Shirt Size"; got != want {
		t.Fatalf("header column 7 = %q, want %q", got, want)
	}
	if got, want := rows[1][6], "Adult M"; got != want {
		t.Fatalf("shirt size = %q, want %q", got, want)
	}
}
