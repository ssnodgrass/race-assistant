package services

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/ssnodgrass/race-assistant/models"
)

func setupCompanionTest(t *testing.T) (*CompanionService, *TimingService, models.Race, models.Event, models.Event) {
	t.Helper()
	raceRepo, eventRepo, partRepo, timingRepo := setupTestDB(t)
	race := models.Race{Name: "Companion Test", Date: time.Now()}
	if err := raceRepo.Create(&race); err != nil {
		t.Fatal(err)
	}
	e5 := models.Event{RaceID: race.ID, Name: "5K", DistanceKM: 5}
	e10 := models.Event{RaceID: race.ID, Name: "10K", DistanceKM: 10}
	if err := eventRepo.Create(&e5); err != nil {
		t.Fatal(err)
	}
	if err := eventRepo.Create(&e10); err != nil {
		t.Fatal(err)
	}
	for _, participant := range []models.Participant{
		{RaceID: race.ID, EventID: e5.ID, BibNumber: "101", FirstName: "Five", LastName: "One", Gender: "F", AgeOnRaceDay: 30},
		{RaceID: race.ID, EventID: e5.ID, BibNumber: "102", FirstName: "Five", LastName: "Two", Gender: "M", AgeOnRaceDay: 31},
		{RaceID: race.ID, EventID: e10.ID, BibNumber: "201", FirstName: "Ten", LastName: "One", Gender: "M", AgeOnRaceDay: 32},
	} {
		p := participant
		if err := partRepo.Create(&p); err != nil {
			t.Fatal(err)
		}
	}
	companion := NewCompanionService()
	companion.SetDB(raceRepo.GetDB())
	companion.ConfigureServer(models.CompanionSetup{HTTPSURL: "https://race-assistant.local:8443", FallbackHTTPSURL: "https://127.0.0.1:8443"})
	return companion, NewTimingService(timingRepo, eventRepo), race, e5, e10
}

func pairCompanion(t *testing.T, service *CompanionService, sessionID, name string) string {
	t.Helper()
	pairing, err := service.CreatePairing(sessionID)
	if err != nil {
		t.Fatal(err)
	}
	token, _, err := service.Pair(pairing.Token, name)
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func companionEntry(id, kind, bib string, captured int64) models.CompanionEntry {
	now := time.Now().UnixMilli()
	return models.CompanionEntry{RequestID: id, Kind: kind, BibNumber: bib, CapturedAt: captured, ClientCapturedAt: captured, CalibrationAt: now, UncertaintyMS: 5}
}

func TestCompanionCommonChuteReconcilesMixedEvents(t *testing.T) {
	service, timing, race, e5, e10 := setupCompanionTest(t)
	session, err := service.StartSession(race.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	timer := pairCompanion(t, service, session.ID, "Timer")
	bibber := pairCompanion(t, service, session.ID, "Bib")
	if err = service.AcquireRole(timer, "timer"); err != nil {
		t.Fatal(err)
	}
	if err = service.AcquireRole(bibber, "bib"); err != nil {
		t.Fatal(err)
	}
	start := time.Now().Add(-40 * time.Minute).Truncate(time.Millisecond)
	race.StartTime = &start
	if _, err = service.db.Exec("UPDATE races SET start_time=? WHERE id=?", start, race.ID); err != nil {
		t.Fatal(err)
	}

	for i, offset := range []time.Duration{18 * time.Minute, 35 * time.Minute, 19 * time.Minute} {
		entry := companionEntry(fmt.Sprintf("time-%d", i), "time", "", start.Add(offset).UnixMilli())
		if _, err = service.Submit(timer, []models.CompanionEntry{entry}); err != nil {
			t.Fatal(err)
		}
	}
	for i, bib := range []string{"101", "201", "102"} {
		entry := companionEntry(fmt.Sprintf("bib-%d", i), "bib", bib, time.Now().UnixMilli())
		if _, err = service.Submit(bibber, []models.CompanionEntry{entry}); err != nil {
			t.Fatal(err)
		}
	}
	results5, err := timing.GetEventResults(e5.ID)
	if err != nil {
		t.Fatal(err)
	}
	results10, err := timing.GetEventResults(e10.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(results5) != 2 || results5[0].Time != "00:18:00.000" || results5[1].ChutePlace != 3 || results5[1].EventPlace != 2 {
		t.Fatalf("unexpected 5K results: %+v", results5)
	}
	if len(results10) != 1 || results10[0].Time != "00:35:00.000" || results10[0].ChutePlace != 2 || results10[0].EventPlace != 1 {
		t.Fatalf("unexpected 10K results: %+v", results10)
	}
}

func TestCompanionSessionRecordsIntoSelectedEvent(t *testing.T) {
	service, _, race, event, _ := setupCompanionTest(t)
	session, err := service.StartSession(race.ID, event.ID)
	if err != nil {
		t.Fatal(err)
	}
	state, err := service.GetState(session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if state.EventName != event.Name || state.Session == nil || state.Session.EventID != event.ID {
		t.Fatalf("unexpected event-scoped state: %+v", state)
	}

	timer := pairCompanion(t, service, session.ID, "Event timer")
	bibber := pairCompanion(t, service, session.ID, "Event bib")
	if err = service.AcquireRole(timer, "timer"); err != nil {
		t.Fatal(err)
	}
	if err = service.AcquireRole(bibber, "bib"); err != nil {
		t.Fatal(err)
	}
	start := time.Now().Add(-time.Minute).Truncate(time.Millisecond)
	if _, err = service.db.Exec("UPDATE races SET start_time=? WHERE id=?", start, race.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Submit(timer, []models.CompanionEntry{companionEntry("event-time", "time", "", start.Add(30*time.Second).UnixMilli())}); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Submit(bibber, []models.CompanionEntry{companionEntry("event-bib", "bib", "101", time.Now().UnixMilli())}); err != nil {
		t.Fatal(err)
	}
	var pulseEventID, bibEventID int
	if err = service.db.QueryRow("SELECT event_id FROM timing_pulses WHERE race_id=?", race.ID).Scan(&pulseEventID); err != nil {
		t.Fatal(err)
	}
	if err = service.db.QueryRow("SELECT event_id FROM chute_assignments WHERE race_id=?", race.ID).Scan(&bibEventID); err != nil {
		t.Fatal(err)
	}
	if pulseEventID != event.ID || bibEventID != event.ID {
		t.Fatalf("selected event %d was not preserved: pulse=%d bib=%d", event.ID, pulseEventID, bibEventID)
	}
}

func TestCompanionOfflineStartDerivesEarlierFinishCapture(t *testing.T) {
	service, _, race, _, _ := setupCompanionTest(t)
	session, _ := service.StartSession(race.ID, 0)
	timer := pairCompanion(t, service, session.ID, "Timer")
	starter := pairCompanion(t, service, session.ID, "Starter")
	_ = service.AcquireRole(timer, "timer")
	_ = service.AcquireRole(starter, "start")
	start := time.Now().Add(-20 * time.Minute).Truncate(time.Millisecond)
	finish := start.Add(18*time.Minute + 123*time.Millisecond)
	if _, err := service.Submit(timer, []models.CompanionEntry{companionEntry("finish-before-start", "time", "", finish.UnixMilli())}); err != nil {
		t.Fatal(err)
	}
	var raw string
	_ = service.db.QueryRow("SELECT raw_time FROM timing_pulses WHERE race_id=?", race.ID).Scan(&raw)
	if raw != "" {
		t.Fatalf("expected pending raw time, got %q", raw)
	}
	if _, err := service.Submit(starter, []models.CompanionEntry{companionEntry("remote-start", "start", "", start.UnixMilli())}); err != nil {
		t.Fatal(err)
	}
	retry, err := service.Submit(starter, []models.CompanionEntry{companionEntry("remote-start", "start", "", start.UnixMilli())})
	if err != nil {
		t.Fatal(err)
	}
	if retry[0].Status != "duplicate" {
		t.Fatalf("lost-response start retry should be idempotent, got %+v", retry[0])
	}
	_ = service.db.QueryRow("SELECT raw_time FROM timing_pulses WHERE race_id=?", race.ID).Scan(&raw)
	if raw != "00:18:00.123" {
		t.Fatalf("expected derived time, got %q", raw)
	}
}

func TestCompanionIdempotencyWarningsPlaceholdersAndUndo(t *testing.T) {
	service, _, race, _, _ := setupCompanionTest(t)
	session, _ := service.StartSession(race.ID, 0)
	token := pairCompanion(t, service, session.ID, "Bib")
	_ = service.AcquireRole(token, "bib")
	first := companionEntry("bib-first", "bib", "101", time.Now().UnixMilli())
	ack, err := service.Submit(token, []models.CompanionEntry{first})
	if err != nil {
		t.Fatal(err)
	}
	retry, err := service.Submit(token, []models.CompanionEntry{first})
	if err != nil {
		t.Fatal(err)
	}
	if ack[0].Place != 1 || retry[0].Status != "duplicate" {
		t.Fatalf("unexpected acknowledgements: %+v %+v", ack, retry)
	}
	dup, _ := service.Submit(token, []models.CompanionEntry{companionEntry("bib-dup", "bib", "101", time.Now().UnixMilli())})
	if dup[0].BibNumber != "DUP:101" || !strings.Contains(dup[0].Warning, "place 1") {
		t.Fatalf("duplicate was not preserved: %+v", dup[0])
	}
	ph, _ := service.Submit(token, []models.CompanionEntry{companionEntry("bib-ph", "bib", "?", time.Now().UnixMilli())})
	if ph[0].BibNumber != "PH:1" || ph[0].Place != 3 {
		t.Fatalf("unexpected placeholder: %+v", ph[0])
	}
	if err = service.Undo(token, "bib-ph"); err != nil {
		t.Fatal(err)
	}
	state, _ := service.GetState(session.ID)
	if state.BibCount != 2 || state.NextBibPlace != 3 {
		t.Fatalf("unexpected state after undo: %+v", state)
	}
}

func TestCompanionGenericPlaceholderBalancesChuteWithoutResult(t *testing.T) {
	service, timing, race, event, _ := setupCompanionTest(t)
	session, err := service.StartSession(race.ID, event.ID)
	if err != nil {
		t.Fatal(err)
	}
	token := pairCompanion(t, service, session.ID, "Bib")
	if err = service.AcquireRole(token, "bib"); err != nil {
		t.Fatal(err)
	}
	timerToken := pairCompanion(t, service, session.ID, "Timer")
	if err = service.AcquireRole(timerToken, "timer"); err != nil {
		t.Fatal(err)
	}
	start := time.Now().Add(-time.Minute).Truncate(time.Millisecond)
	if _, err = service.db.Exec("UPDATE races SET start_time=? WHERE id=?", start, race.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Submit(timerToken, []models.CompanionEntry{companionEntry("generic-time", "time", "", time.Now().UnixMilli())}); err != nil {
		t.Fatal(err)
	}
	acks, err := service.Submit(token, []models.CompanionEntry{companionEntry("generic-finish", "bib", "__GENERIC__", time.Now().UnixMilli())})
	if err != nil {
		t.Fatal(err)
	}
	if acks[0].Place != 1 || !strings.HasPrefix(acks[0].BibNumber, "GP:") || !strings.Contains(acks[0].Warning, "not included") {
		t.Fatalf("unexpected generic placeholder acknowledgement: %+v", acks[0])
	}
	var stored string
	if err = service.db.QueryRow("SELECT bib_number FROM chute_assignments WHERE race_id=? AND event_id=?", race.ID, event.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(stored, "GP:") {
		t.Fatalf("generic marker was not stored: %q", stored)
	}
	state, err := service.GetState(session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if state.TimeCount != 1 || state.BibCount != 1 || state.TimeCount-state.BibCount != 0 {
		t.Fatalf("generic finish did not balance the streams: %+v", state)
	}
	results, err := timing.GetEventResults(event.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		t.Fatalf("generic placeholder leaked into results: %+v", results)
	}
}

func TestCompanionRoleIsExclusive(t *testing.T) {
	service, _, race, _, _ := setupCompanionTest(t)
	session, _ := service.StartSession(race.ID, 0)
	one := pairCompanion(t, service, session.ID, "One")
	two := pairCompanion(t, service, session.ID, "Two")
	if err := service.AcquireRole(one, "timer"); err != nil {
		t.Fatal(err)
	}
	if err := service.AcquireRole(one, "bib"); err == nil {
		t.Fatal("same device acquired a second role without releasing its first role")
	}
	if err := service.AcquireRole(two, "timer"); err != ErrCompanionLease {
		t.Fatalf("expected lease conflict, got %v", err)
	}
}

func TestParticipantDuplicateTriggerAndSessionPreflight(t *testing.T) {
	service, _, race, e5, _ := setupCompanionTest(t)
	_, err := service.db.Exec(`INSERT INTO participants(race_id,event_id,bib_number,first_name,last_name,gender,age_on_race_day) VALUES(?,?,?,?,?,?,?)`, race.ID, e5.ID, "101", "Duplicate", "Runner", "F", 20)
	if err == nil || !strings.Contains(err.Error(), "bib number already exists") {
		t.Fatalf("expected friendly duplicate trigger error, got %v", err)
	}
}

func TestCompanionPairingCannotOutliveItsSession(t *testing.T) {
	service, _, race, _, _ := setupCompanionTest(t)
	session, err := service.StartSession(race.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	pairing, err := service.CreatePairing(session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = service.StopSession(session.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err = service.Pair(pairing.Token, "Late phone"); err == nil {
		t.Fatal("pairing succeeded after its session was stopped")
	}
}

func TestCompanionNumericPairingCodeIsEightDigitsAndSingleUse(t *testing.T) {
	service, _, race, _, _ := setupCompanionTest(t)
	session, err := service.StartSession(race.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	pairing, err := service.CreatePairing(session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(pairing.Code) != 8 {
		t.Fatalf("expected an eight-digit code, got %q", pairing.Code)
	}
	if !strings.HasPrefix(pairing.URL, "https://race-assistant.local:8443/companion/") || !strings.HasPrefix(pairing.FallbackURL, "https://127.0.0.1:8443/companion/") {
		t.Fatalf("pairing URLs did not include stable and fallback origins: %+v", pairing)
	}
	for _, digit := range pairing.Code {
		if digit < '0' || digit > '9' {
			t.Fatalf("pairing code is not numeric: %q", pairing.Code)
		}
	}
	if _, state, err := service.Pair(pairing.Code, "Code phone"); err != nil || state.Session == nil || state.Session.ID != session.ID {
		t.Fatalf("numeric pairing failed: state=%+v err=%v", state, err)
	}
	if _, _, err := service.Pair(pairing.Token, "QR reuse"); err == nil {
		t.Fatal("QR token remained usable after its matching numeric code was consumed")
	}
	pairing, err = service.CreatePairing(session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err = service.Pair(pairing.Token, "QR phone"); err != nil {
		t.Fatalf("QR pairing failed: %v", err)
	}
	if _, _, err = service.Pair(pairing.Code, "Code reuse"); err == nil {
		t.Fatal("numeric code remained usable after its matching QR token was consumed")
	}
}
