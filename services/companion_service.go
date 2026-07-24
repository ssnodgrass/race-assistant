package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math/big"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ssnodgrass/race-assistant/models"
)

var (
	ErrCompanionUnauthorized = errors.New("companion device is not authorized")
	ErrCompanionUnavailable  = errors.New("companion database is temporarily unavailable")
	ErrCompanionLease        = errors.New("companion role is held by another device")
)

type pairingGrant struct {
	ID        string
	SessionID string
	ExpiresAt int64
}

type companionIdentity struct {
	DeviceID string
	Session  models.CompanionSession
}

type CompanionService struct {
	mu       sync.Mutex
	db       *sql.DB
	pairings map[string]pairingGrant
	setup    models.CompanionSetup
}

func NewCompanionService() *CompanionService {
	return &CompanionService{pairings: make(map[string]pairingGrant)}
}

func (s *CompanionService) SetDB(db *sql.DB) {
	s.mu.Lock()
	s.db = db
	s.mu.Unlock()
	if db != nil {
		if err := backfillCompanionChuteTimes(db); err != nil {
			log.Printf("Companion chute-time backfill failed: %v", err)
		}
	}
}

func (s *CompanionService) ConfigureServer(setup models.CompanionSetup) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.setup = setup
}

func (s *CompanionService) GetSetup() models.CompanionSetup {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.setup
}

func randomToken(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func randomNumericCode(digits int) (string, error) {
	limit := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(digits)), nil)
	value, err := rand.Int(rand.Reader, limit)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%0*d", digits, value), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (s *CompanionService) StartSession(raceID, eventID int) (models.CompanionSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return models.CompanionSession{}, fmt.Errorf("no database connection")
	}
	var raceExists int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM races WHERE id=?", raceID).Scan(&raceExists); err != nil {
		return models.CompanionSession{}, err
	}
	if raceExists == 0 {
		return models.CompanionSession{}, fmt.Errorf("race not found")
	}
	if eventID != 0 {
		var eventExists int
		if err := s.db.QueryRow("SELECT COUNT(*) FROM events WHERE id=? AND race_id=?", eventID, raceID).Scan(&eventExists); err != nil {
			return models.CompanionSession{}, err
		}
		if eventExists == 0 {
			return models.CompanionSession{}, fmt.Errorf("event not found for this race")
		}
	}
	if eventID == 0 {
		dupes, err := duplicateBibs(s.db, raceID)
		if err != nil {
			return models.CompanionSession{}, err
		}
		if len(dupes) > 0 {
			return models.CompanionSession{}, fmt.Errorf("common chute requires unique bibs; duplicates: %s", strings.Join(dupes, ", "))
		}
	}
	id, err := randomToken(16)
	if err != nil {
		return models.CompanionSession{}, err
	}
	now := time.Now().UnixMilli()
	expires := time.Now().Add(24 * time.Hour).UnixMilli()
	tx, err := s.db.Begin()
	if err != nil {
		return models.CompanionSession{}, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec("UPDATE companion_sessions SET status='stopped', stopped_at_unix_ms=? WHERE race_id=? AND status='active'", now, raceID); err != nil {
		return models.CompanionSession{}, err
	}
	_, err = tx.Exec(`INSERT INTO companion_sessions
		(id, race_id, event_id, status, created_at_unix_ms, expires_at_unix_ms)
		VALUES (?, ?, ?, 'active', ?, ?)`, id, raceID, eventID, now, expires)
	if err != nil {
		return models.CompanionSession{}, err
	}
	if err := tx.Commit(); err != nil {
		return models.CompanionSession{}, err
	}
	return models.CompanionSession{ID: id, RaceID: raceID, EventID: eventID, Status: "active", CreatedAt: now, ExpiresAt: expires}, nil
}

func (s *CompanionService) StopSession(sessionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return fmt.Errorf("no database connection")
	}
	_, err := s.db.Exec("UPDATE companion_sessions SET status='stopped', stopped_at_unix_ms=? WHERE id=?", time.Now().UnixMilli(), sessionID)
	return err
}

func (s *CompanionService) CreatePairing(sessionID string) (models.CompanionPairing, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return models.CompanionPairing{}, fmt.Errorf("no database connection")
	}
	var status string
	if err := s.db.QueryRow("SELECT status FROM companion_sessions WHERE id=? AND expires_at_unix_ms>?", sessionID, time.Now().UnixMilli()).Scan(&status); err != nil || status != "active" {
		return models.CompanionPairing{}, fmt.Errorf("companion session is not active")
	}
	token, err := randomToken(32)
	if err != nil {
		return models.CompanionPairing{}, err
	}
	grantID, err := randomToken(12)
	if err != nil {
		return models.CompanionPairing{}, err
	}
	var code string
	for attempts := 0; attempts < 10; attempts++ {
		code, err = randomNumericCode(8)
		if err != nil {
			return models.CompanionPairing{}, err
		}
		if _, exists := s.pairings[hashToken(code)]; !exists {
			break
		}
		code = ""
	}
	if code == "" {
		return models.CompanionPairing{}, fmt.Errorf("could not allocate a pairing code")
	}
	expires := time.Now().Add(5 * time.Minute).UnixMilli()
	grant := pairingGrant{ID: grantID, SessionID: sessionID, ExpiresAt: expires}
	s.pairings[hashToken(token)] = grant
	s.pairings[hashToken(code)] = grant
	url := strings.TrimRight(s.setup.HTTPSURL, "/") + "/companion/#pair=" + token
	fallbackURL := ""
	if s.setup.FallbackHTTPSURL != "" {
		fallbackURL = strings.TrimRight(s.setup.FallbackHTTPSURL, "/") + "/companion/#pair=" + token
	}
	return models.CompanionPairing{Token: token, Code: code, URL: url, FallbackURL: fallbackURL, ExpiresAt: expires}, nil
}

func (s *CompanionService) deletePairingGrantLocked(grant pairingGrant) {
	for key, candidate := range s.pairings {
		if candidate.ID == grant.ID {
			delete(s.pairings, key)
		}
	}
}

func (s *CompanionService) Pair(token, name string) (string, models.CompanionState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return "", models.CompanionState{}, ErrCompanionUnavailable
	}
	credential := strings.TrimSpace(token)
	grant, ok := s.pairings[hashToken(credential)]
	if !ok || grant.ExpiresAt < time.Now().UnixMilli() {
		if ok {
			s.deletePairingGrantLocked(grant)
		}
		return "", models.CompanionState{}, fmt.Errorf("pairing code is invalid or expired")
	}
	var active int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM companion_sessions
		WHERE id=? AND status='active' AND expires_at_unix_ms>?`, grant.SessionID, time.Now().UnixMilli()).Scan(&active); err != nil {
		return "", models.CompanionState{}, err
	}
	if active == 0 {
		s.deletePairingGrantLocked(grant)
		return "", models.CompanionState{}, fmt.Errorf("companion session is no longer active")
	}
	s.deletePairingGrantLocked(grant)
	if strings.TrimSpace(name) == "" {
		name = "Companion phone"
	}
	deviceID, err := randomToken(12)
	if err != nil {
		return "", models.CompanionState{}, err
	}
	deviceToken, err := randomToken(32)
	if err != nil {
		return "", models.CompanionState{}, err
	}
	now := time.Now().UnixMilli()
	_, err = s.db.Exec(`INSERT INTO companion_devices
		(id, session_id, display_name, token_hash, paired_at_unix_ms, last_seen_at_unix_ms)
		VALUES (?, ?, ?, ?, ?, ?)`, deviceID, grant.SessionID, name, hashToken(deviceToken), now, now)
	if err != nil {
		return "", models.CompanionState{}, err
	}
	state, err := s.getStateLocked(grant.SessionID)
	return deviceToken, state, err
}

func (s *CompanionService) Authenticate(token string) (companionIdentity, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.authenticateLocked(token)
}

func (s *CompanionService) authenticateLocked(token string) (companionIdentity, error) {
	if s.db == nil {
		return companionIdentity{}, ErrCompanionUnavailable
	}
	if token == "" {
		return companionIdentity{}, ErrCompanionUnauthorized
	}
	var id companionIdentity
	var revoked sql.NullInt64
	err := s.db.QueryRow(`SELECT d.id, d.revoked_at_unix_ms,
		s.id, s.race_id, s.event_id, s.status, s.created_at_unix_ms, s.expires_at_unix_ms
		FROM companion_devices d JOIN companion_sessions s ON s.id=d.session_id
		WHERE d.token_hash=?`, hashToken(token)).Scan(
		&id.DeviceID, &revoked, &id.Session.ID, &id.Session.RaceID, &id.Session.EventID,
		&id.Session.Status, &id.Session.CreatedAt, &id.Session.ExpiresAt)
	if err != nil || revoked.Valid || id.Session.Status != "active" || id.Session.ExpiresAt < time.Now().UnixMilli() {
		return companionIdentity{}, ErrCompanionUnauthorized
	}
	_, _ = s.db.Exec("UPDATE companion_devices SET last_seen_at_unix_ms=? WHERE id=?", time.Now().UnixMilli(), id.DeviceID)
	return id, nil
}

func (s *CompanionService) StateForToken(token string) (models.CompanionState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, err := s.authenticateLocked(token)
	if err != nil {
		return models.CompanionState{}, err
	}
	return s.getStateLocked(id.Session.ID)
}

func (s *CompanionService) CheckInRoster(token string) (models.CompanionCheckInRoster, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, err := s.authenticateLocked(token)
	if err != nil {
		return models.CompanionCheckInRoster{}, err
	}
	return s.checkInRosterLocked(id)
}

func (s *CompanionService) checkInRosterLocked(id companionIdentity) (models.CompanionCheckInRoster, error) {
	var roster models.CompanionCheckInRoster
	roster.SessionID = id.Session.ID
	if err := s.db.QueryRow("SELECT name FROM races WHERE id=?", id.Session.RaceID).Scan(&roster.RaceName); err != nil {
		return roster, err
	}
	rows, err := s.db.Query(`SELECT p.id,p.event_id,COALESCE(e.name,''),p.bib_number,
		p.first_name,p.last_name,p.gender,p.age_on_race_day,p.checked_in
		FROM participants p LEFT JOIN events e ON e.id=p.event_id
		WHERE p.race_id=? ORDER BY p.last_name,p.first_name,p.id`, id.Session.RaceID)
	if err != nil {
		return roster, err
	}
	defer rows.Close()
	roster.Participants = make([]models.CompanionCheckInParticipant, 0)
	for rows.Next() {
		var participant models.CompanionCheckInParticipant
		if err := rows.Scan(
			&participant.ID, &participant.EventID, &participant.EventName, &participant.BibNumber,
			&participant.FirstName, &participant.LastName, &participant.Gender, &participant.Age,
			&participant.CheckedIn,
		); err != nil {
			return roster, err
		}
		roster.Participants = append(roster.Participants, participant)
	}
	return roster, rows.Err()
}

func (s *CompanionService) SubmitCheckIn(token string, request models.CompanionCheckInRequest) (models.CompanionCheckInAck, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, err := s.authenticateLocked(token)
	if err != nil {
		return models.CompanionCheckInAck{}, err
	}
	return s.submitCheckInLocked(id, request)
}

func (s *CompanionService) submitCheckInLocked(id companionIdentity, request models.CompanionCheckInRequest) (models.CompanionCheckInAck, error) {
	bib := strings.TrimSpace(request.BibNumber)
	if request.RequestID == "" || request.ParticipantID <= 0 || bib == "" || request.CapturedAt <= 0 {
		return models.CompanionCheckInAck{}, fmt.Errorf("request_id, participant_id, bib_number, and captured_at_unix_ms are required")
	}

	var priorSession, priorDevice, priorBib string
	var priorParticipant int
	var priorCaptured int64
	err := s.db.QueryRow(`SELECT session_id,device_id,participant_id,bib_number,captured_at_unix_ms
		FROM companion_checkins WHERE request_id=?`, request.RequestID).
		Scan(&priorSession, &priorDevice, &priorParticipant, &priorBib, &priorCaptured)
	if err == nil {
		if priorSession != id.Session.ID || priorDevice != id.DeviceID || priorParticipant != request.ParticipantID ||
			priorBib != bib || priorCaptured != request.CapturedAt {
			return models.CompanionCheckInAck{}, fmt.Errorf("request_id is already used by another check-in")
		}
		participant, err := s.checkInParticipantLocked(id.Session.RaceID, request.ParticipantID)
		return models.CompanionCheckInAck{RequestID: request.RequestID, Status: "duplicate", Participant: participant}, err
	}
	if err != sql.ErrNoRows {
		return models.CompanionCheckInAck{}, err
	}

	tx, err := s.db.BeginTx(context.Background(), nil)
	if err != nil {
		return models.CompanionCheckInAck{}, err
	}
	defer tx.Rollback()
	var participantRaceID int
	if err := tx.QueryRow("SELECT race_id FROM participants WHERE id=?", request.ParticipantID).Scan(&participantRaceID); err != nil {
		if err == sql.ErrNoRows {
			return models.CompanionCheckInAck{}, fmt.Errorf("participant not found")
		}
		return models.CompanionCheckInAck{}, err
	}
	if participantRaceID != id.Session.RaceID {
		return models.CompanionCheckInAck{}, fmt.Errorf("participant does not belong to this race")
	}
	if _, err := tx.Exec("UPDATE participants SET bib_number=?,checked_in=1 WHERE id=?", bib, request.ParticipantID); err != nil {
		return models.CompanionCheckInAck{}, err
	}
	if _, err := tx.Exec(`INSERT INTO companion_checkins
		(request_id,session_id,device_id,participant_id,bib_number,captured_at_unix_ms,accepted_at_unix_ms)
		VALUES(?,?,?,?,?,?,?)`, request.RequestID, id.Session.ID, id.DeviceID, request.ParticipantID, bib, request.CapturedAt, time.Now().UnixMilli()); err != nil {
		return models.CompanionCheckInAck{}, err
	}
	if err := tx.Commit(); err != nil {
		return models.CompanionCheckInAck{}, err
	}
	participant, err := s.checkInParticipantLocked(id.Session.RaceID, request.ParticipantID)
	return models.CompanionCheckInAck{RequestID: request.RequestID, Status: "accepted", Participant: participant}, err
}

func (s *CompanionService) checkInParticipantLocked(raceID, participantID int) (models.CompanionCheckInParticipant, error) {
	var participant models.CompanionCheckInParticipant
	err := s.db.QueryRow(`SELECT p.id,p.event_id,COALESCE(e.name,''),p.bib_number,
		p.first_name,p.last_name,p.gender,p.age_on_race_day,p.checked_in
		FROM participants p LEFT JOIN events e ON e.id=p.event_id
		WHERE p.race_id=? AND p.id=?`, raceID, participantID).Scan(
		&participant.ID, &participant.EventID, &participant.EventName, &participant.BibNumber,
		&participant.FirstName, &participant.LastName, &participant.Gender, &participant.Age,
		&participant.CheckedIn,
	)
	if err == sql.ErrNoRows {
		return participant, fmt.Errorf("participant not found")
	}
	return participant, err
}

func (s *CompanionService) GetState(sessionID string) (models.CompanionState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.getStateLocked(sessionID)
}

func (s *CompanionService) GetActiveState(raceID int) (models.CompanionState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return models.CompanionState{}, fmt.Errorf("no database connection")
	}
	var sessionID string
	err := s.db.QueryRow(`SELECT id FROM companion_sessions
		WHERE race_id=? AND status='active' AND expires_at_unix_ms>?
		ORDER BY created_at_unix_ms DESC LIMIT 1`, raceID, time.Now().UnixMilli()).Scan(&sessionID)
	if err == sql.ErrNoRows {
		return models.CompanionState{}, nil
	}
	if err != nil {
		return models.CompanionState{}, err
	}
	return s.getStateLocked(sessionID)
}

func (s *CompanionService) ClearRole(sessionID, role string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return fmt.Errorf("no database connection")
	}
	_, err := s.db.Exec("DELETE FROM companion_role_leases WHERE session_id=? AND role=?", sessionID, role)
	return err
}

func (s *CompanionService) getStateLocked(sessionID string) (models.CompanionState, error) {
	if s.db == nil {
		return models.CompanionState{}, fmt.Errorf("no database connection")
	}
	var state models.CompanionState
	var sess models.CompanionSession
	var start sql.NullTime
	err := s.db.QueryRow(`SELECT s.id,s.race_id,s.event_id,s.status,s.created_at_unix_ms,s.expires_at_unix_ms,
		r.name,r.start_time,COALESCE(e.name,'Common Chute — All Events')
		FROM companion_sessions s
		JOIN races r ON r.id=s.race_id
		LEFT JOIN events e ON e.id=s.event_id
		WHERE s.id=?`, sessionID).Scan(
		&sess.ID, &sess.RaceID, &sess.EventID, &sess.Status, &sess.CreatedAt, &sess.ExpiresAt,
		&state.RaceName, &start, &state.EventName)
	if err != nil {
		return state, err
	}
	state.Session = &sess
	if start.Valid {
		state.RaceStart = &start.Time
	}
	rows, err := s.db.Query(`SELECT d.id,d.display_name,d.last_seen_at_unix_ms,d.revoked_at_unix_ms,
		COALESCE((SELECT role FROM companion_role_leases l WHERE l.session_id=d.session_id AND l.device_id=d.id),'')
		FROM companion_devices d WHERE d.session_id=? ORDER BY d.paired_at_unix_ms`, sessionID)
	if err != nil {
		return state, err
	}
	defer rows.Close()
	for rows.Next() {
		var d models.CompanionDevice
		var revoked sql.NullInt64
		if err := rows.Scan(&d.ID, &d.Name, &d.LastSeen, &revoked, &d.Role); err != nil {
			return state, err
		}
		d.Revoked = revoked.Valid
		state.Devices = append(state.Devices, d)
	}
	_ = s.db.QueryRow("SELECT COUNT(*),COALESCE(MAX(place),0)+1 FROM timing_pulses WHERE race_id=? AND event_id=?", sess.RaceID, sess.EventID).Scan(&state.TimeCount, &state.NextTimePlace)
	_ = s.db.QueryRow("SELECT COUNT(*),COALESCE(MAX(place),0)+1 FROM chute_assignments WHERE race_id=? AND event_id=?", sess.RaceID, sess.EventID).Scan(&state.BibCount, &state.NextBibPlace)
	var lastBib models.CompanionLastBib
	err = s.db.QueryRow(`
		SELECT COALESCE(cr.request_id,''),ca.place,ca.bib_number,
			COALESCE(TRIM(p.first_name || ' ' || p.last_name),''),
			COALESCE(e.name,''),ca.entered_at_unix_ms
		FROM chute_assignments ca
		LEFT JOIN participants p ON p.race_id=ca.race_id
			AND p.bib_number=CASE
				WHEN ca.bib_number LIKE 'DUP:%' THEN SUBSTR(ca.bib_number,5)
				ELSE ca.bib_number
			END
		LEFT JOIN events e ON e.id=p.event_id
		LEFT JOIN companion_requests cr ON cr.race_id=ca.race_id
			AND cr.event_id=ca.event_id
			AND cr.operation='bib'
			AND cr.assigned_place=ca.place
			AND cr.value=ca.bib_number
			AND cr.accepted_at_unix_ms=ca.entered_at_unix_ms
			AND cr.undone_at_unix_ms IS NULL
		WHERE ca.race_id=? AND ca.event_id=?
		ORDER BY ca.entered_at_unix_ms DESC,ca.place DESC
		LIMIT 1`, sess.RaceID, sess.EventID).Scan(
		&lastBib.RequestID, &lastBib.Place, &lastBib.BibNumber,
		&lastBib.ParticipantName, &lastBib.EventName, &lastBib.EnteredAt)
	if err == nil {
		state.LastBib = &lastBib
	} else if err != sql.ErrNoRows {
		return state, err
	}
	state.DuplicateBibs, _ = duplicateBibs(s.db, sess.RaceID)
	return state, nil
}

func duplicateBibs(db *sql.DB, raceID int) ([]string, error) {
	rows, err := db.Query(`SELECT bib_number FROM participants WHERE race_id=? AND bib_number<>'' GROUP BY bib_number HAVING COUNT(*)>1 ORDER BY bib_number`, raceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var bib string
		if err := rows.Scan(&bib); err != nil {
			return nil, err
		}
		out = append(out, bib)
	}
	return out, rows.Err()
}

func (s *CompanionService) AcquireRole(token, role string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if role != "start" && role != "timer" && role != "bib" {
		return fmt.Errorf("invalid companion role")
	}
	id, err := s.authenticateLocked(token)
	if err != nil {
		return err
	}
	var otherRole string
	err = s.db.QueryRow(`SELECT role FROM companion_role_leases
		WHERE session_id=? AND device_id=? AND role<>? LIMIT 1`, id.Session.ID, id.DeviceID, role).Scan(&otherRole)
	if err == nil {
		return fmt.Errorf("this device already holds the %s role; release it before switching", otherRole)
	}
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	var holder string
	err = s.db.QueryRow("SELECT device_id FROM companion_role_leases WHERE session_id=? AND role=?", id.Session.ID, role).Scan(&holder)
	if err == nil && holder != id.DeviceID {
		return ErrCompanionLease
	}
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	_, err = s.db.Exec(`INSERT INTO companion_role_leases(session_id,role,device_id,acquired_at_unix_ms)
		VALUES(?,?,?,?) ON CONFLICT(session_id,role) DO UPDATE SET device_id=excluded.device_id,acquired_at_unix_ms=excluded.acquired_at_unix_ms`,
		id.Session.ID, role, id.DeviceID, time.Now().UnixMilli())
	return err
}

func (s *CompanionService) ReleaseRole(token, role string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, err := s.authenticateLocked(token)
	if err != nil {
		return err
	}
	_, err = s.db.Exec("DELETE FROM companion_role_leases WHERE session_id=? AND role=? AND device_id=?", id.Session.ID, role, id.DeviceID)
	return err
}

func (s *CompanionService) RevokeDevice(deviceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return fmt.Errorf("no database connection")
	}
	return s.revokeDeviceLocked(deviceID)
}

func (s *CompanionService) Unpair(token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, err := s.authenticateLocked(token)
	if err != nil {
		return err
	}
	return s.revokeDeviceLocked(id.DeviceID)
}

func (s *CompanionService) revokeDeviceLocked(deviceID string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec("DELETE FROM companion_role_leases WHERE device_id=?", deviceID); err != nil {
		return err
	}
	if _, err = tx.Exec("UPDATE companion_devices SET revoked_at_unix_ms=? WHERE id=?", time.Now().UnixMilli(), deviceID); err != nil {
		return err
	}
	return tx.Commit()
}

func formatElapsed(ms int64) string {
	if ms < 0 {
		ms = 0
	}
	h := ms / 3600000
	ms %= 3600000
	m := ms / 60000
	ms %= 60000
	sec := ms / 1000
	milli := ms % 1000
	return fmt.Sprintf("%02d:%02d:%02d.%03d", h, m, sec, milli)
}

func (s *CompanionService) Submit(token string, entries []models.CompanionEntry) ([]models.CompanionAck, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, err := s.authenticateLocked(token)
	if err != nil {
		return nil, err
	}
	acks := make([]models.CompanionAck, 0, len(entries))
	for _, entry := range entries {
		ack, err := s.submitLocked(id, entry)
		if err != nil {
			return acks, err
		}
		acks = append(acks, ack)
	}
	return acks, nil
}

func (s *CompanionService) requireLeaseLocked(id companionIdentity, role string) error {
	var holder string
	err := s.db.QueryRow("SELECT device_id FROM companion_role_leases WHERE session_id=? AND role=?", id.Session.ID, role).Scan(&holder)
	if err == sql.ErrNoRows {
		return fmt.Errorf("this device does not hold the companion %s role; reacquire it before syncing", role)
	}
	if err != nil {
		return err
	}
	if holder != id.DeviceID {
		return ErrCompanionLease
	}
	return nil
}

func (s *CompanionService) submitLocked(id companionIdentity, entry models.CompanionEntry) (models.CompanionAck, error) {
	if entry.RequestID == "" || entry.CapturedAt <= 0 {
		return models.CompanionAck{}, fmt.Errorf("request_id and captured_at_unix_ms are required")
	}
	var prior models.CompanionAck
	var priorSession, priorDevice, priorOperation, priorValue string
	var priorCaptured int64
	var priorUndone sql.NullInt64
	err := s.db.QueryRow(`SELECT session_id,device_id,operation,COALESCE(assigned_place,0),value,captured_at_unix_ms,undone_at_unix_ms
		FROM companion_requests WHERE request_id=?`, entry.RequestID).Scan(
		&priorSession, &priorDevice, &priorOperation, &prior.Place, &priorValue, &priorCaptured, &priorUndone)
	if err == nil {
		if priorSession != id.Session.ID || priorDevice != id.DeviceID || priorOperation != entry.Kind || priorCaptured != entry.CapturedAt {
			return models.CompanionAck{}, fmt.Errorf("request_id is already used by another companion operation")
		}
		prior.RequestID = entry.RequestID
		prior.Status = "duplicate"
		prior.BibNumber = priorValue
		if priorUndone.Valid {
			prior.Status = "undone"
			prior.Warning = "this entry was already undone"
		}
		return prior, nil
	}
	if err != sql.ErrNoRows {
		return models.CompanionAck{}, err
	}
	nowMS := time.Now().UnixMilli()
	if entry.CapturedAt > nowMS+int64(time.Minute/time.Millisecond) {
		return models.CompanionAck{}, fmt.Errorf("capture time is too far in the future; recalibrate the phone clock")
	}
	if entry.ClientCapturedAt <= 0 || entry.CalibrationAt <= 0 ||
		entry.CalibrationAt > entry.ClientCapturedAt+int64(time.Minute/time.Millisecond) ||
		entry.ClientCapturedAt-entry.CalibrationAt > int64(30*time.Minute/time.Millisecond) {
		return models.CompanionAck{}, fmt.Errorf("clock calibration is expired")
	}
	role := entry.Kind
	if role == "time" {
		role = "timer"
	}
	if err := s.requireLeaseLocked(id, role); err != nil {
		return models.CompanionAck{}, err
	}
	if entry.UncertaintyMS > 100 {
		return models.CompanionAck{}, fmt.Errorf("clock uncertainty is too high")
	}
	tx, err := s.db.BeginTx(context.Background(), nil)
	if err != nil {
		return prior, err
	}
	defer tx.Rollback()
	now := time.Now().UnixMilli()
	ack := models.CompanionAck{RequestID: entry.RequestID, Status: "accepted"}
	var place int
	var storedValue string
	switch entry.Kind {
	case "start":
		var current sql.NullTime
		if err := tx.QueryRow("SELECT start_time FROM races WHERE id=?", id.Session.RaceID).Scan(&current); err != nil {
			return ack, err
		}
		captured := time.UnixMilli(entry.CapturedAt)
		if current.Valid && current.Time.UnixMilli() != entry.CapturedAt {
			return ack, fmt.Errorf("race clock already has a different start")
		}
		if !current.Valid {
			if _, err := tx.Exec("UPDATE races SET start_time=? WHERE id=?", captured, id.Session.RaceID); err != nil {
				return ack, err
			}
			if err := deriveCompanionTimesTx(tx, id.Session.RaceID, captured); err != nil {
				return ack, err
			}
		}
		ack.Elapsed = "00:00:00.000"
	case "time":
		if err := tx.QueryRow("SELECT COALESCE(MAX(place),0)+1 FROM timing_pulses WHERE race_id=? AND event_id=?", id.Session.RaceID, id.Session.EventID).Scan(&place); err != nil {
			return ack, err
		}
		var start sql.NullTime
		if err := tx.QueryRow("SELECT start_time FROM races WHERE id=?", id.Session.RaceID).Scan(&start); err != nil {
			return ack, err
		}
		elapsed := ""
		if start.Valid {
			if entry.CapturedAt < start.Time.UnixMilli() {
				return ack, fmt.Errorf("finish capture precedes the official start; recalibrate the phone clock")
			}
			elapsed = formatElapsed(entry.CapturedAt - start.Time.UnixMilli())
		}
		if _, err := tx.Exec(`INSERT INTO timing_pulses(race_id,event_id,place,raw_time,captured_at_unix_ms,capture_source)
			VALUES(?,?,?,?,?,'companion')`, id.Session.RaceID, id.Session.EventID, place, elapsed, entry.CapturedAt); err != nil {
			return ack, err
		}
		ack.Place, ack.Elapsed = place, elapsed
	case "bib":
		if err := tx.QueryRow("SELECT COALESCE(MAX(place),0)+1 FROM chute_assignments WHERE race_id=? AND event_id=?", id.Session.RaceID, id.Session.EventID).Scan(&place); err != nil {
			return ack, err
		}
		var start sql.NullTime
		if err := tx.QueryRow("SELECT start_time FROM races WHERE id=?", id.Session.RaceID).Scan(&start); err != nil {
			return ack, err
		}
		unofficialTime := ""
		if start.Valid {
			if entry.CapturedAt < start.Time.UnixMilli() {
				return ack, fmt.Errorf("bib capture precedes the race start; recalibrate the phone clock")
			}
			unofficialTime = formatElapsed(entry.CapturedAt - start.Time.UnixMilli())
		}
		bib := strings.TrimSpace(entry.BibNumber)
		if bib == "" || bib == "?" {
			var n int
			rows, qerr := tx.Query("SELECT bib_number FROM chute_assignments WHERE race_id=? AND bib_number LIKE 'PH:%'", id.Session.RaceID)
			if qerr != nil {
				return ack, qerr
			}
			for rows.Next() {
				var v string
				_ = rows.Scan(&v)
				x, _ := strconv.Atoi(strings.TrimPrefix(v, "PH:"))
				if x > n {
					n = x
				}
			}
			rows.Close()
			bib = fmt.Sprintf("PH:%d", n+1)
			ack.Warning = "placeholder"
		} else if bib == "__GENERIC__" {
			bib = "GP:" + entry.RequestID
			ack.Warning = "excluded finish — not included in results"
		} else {
			var original int
			err := tx.QueryRow("SELECT place FROM chute_assignments WHERE race_id=? AND bib_number=? AND bib_number NOT LIKE 'DUP:%' LIMIT 1", id.Session.RaceID, bib).Scan(&original)
			if err == nil {
				ack.Warning = fmt.Sprintf("duplicate of place %d", original)
				bib = "DUP:" + bib
			} else if err != sql.ErrNoRows {
				return ack, err
			}
		}
		lookupBib := strings.TrimPrefix(bib, "DUP:")
		var first, last, event string
		err := tx.QueryRow(`SELECT p.first_name,p.last_name,e.name FROM participants p LEFT JOIN events e ON e.id=p.event_id WHERE p.race_id=? AND p.bib_number=? LIMIT 1`, id.Session.RaceID, lookupBib).Scan(&first, &last, &event)
		if err == nil {
			ack.ParticipantName = strings.TrimSpace(first + " " + last)
			ack.EventName = event
		} else if err == sql.ErrNoRows && ack.Warning == "" && !strings.HasPrefix(bib, "PH:") && !strings.HasPrefix(bib, "GP:") {
			ack.Warning = "unknown bib"
		} else if err != nil && err != sql.ErrNoRows {
			return ack, err
		}
		if _, err := tx.Exec(`INSERT INTO chute_assignments(race_id,event_id,place,bib_number,unofficial_time,entered_at_unix_ms) VALUES(?,?,?,?,?,?)`, id.Session.RaceID, id.Session.EventID, place, bib, unofficialTime, now); err != nil {
			return ack, err
		}
		ack.Place, ack.BibNumber, ack.Elapsed, storedValue = place, bib, unofficialTime, bib
	default:
		return ack, fmt.Errorf("invalid companion entry kind")
	}
	if _, err := tx.Exec(`INSERT INTO companion_requests(request_id,session_id,device_id,race_id,event_id,operation,assigned_place,captured_at_unix_ms,value,accepted_at_unix_ms)
		VALUES(?,?,?,?,?,?,?,?,?,?)`, entry.RequestID, id.Session.ID, id.DeviceID, id.Session.RaceID, id.Session.EventID, entry.Kind, nullablePlace(place), entry.CapturedAt, storedValue, now); err != nil {
		return ack, err
	}
	if entry.Kind == "start" {
		_, _ = tx.Exec("DELETE FROM companion_role_leases WHERE session_id=? AND role='start' AND device_id=?", id.Session.ID, id.DeviceID)
	}
	if err := tx.Commit(); err != nil {
		return ack, err
	}
	return ack, nil
}

func nullablePlace(place int) interface{} {
	if place == 0 {
		return nil
	}
	return place
}

func deriveCompanionTimesTx(tx *sql.Tx, raceID int, start time.Time) error {
	rows, err := tx.Query("SELECT id,captured_at_unix_ms FROM timing_pulses WHERE race_id=? AND capture_source='companion' AND captured_at_unix_ms IS NOT NULL", raceID)
	if err != nil {
		return err
	}
	type pulse struct {
		id int
		at int64
	}
	var pulses []pulse
	for rows.Next() {
		var p pulse
		if err := rows.Scan(&p.id, &p.at); err != nil {
			rows.Close()
			return err
		}
		pulses = append(pulses, p)
	}
	rows.Close()
	for _, p := range pulses {
		if p.at < start.UnixMilli() {
			return fmt.Errorf("a queued finish capture precedes the official start; recalibrate before syncing the start")
		}
		if _, err := tx.Exec("UPDATE timing_pulses SET raw_time=? WHERE id=?", formatElapsed(p.at-start.UnixMilli()), p.id); err != nil {
			return err
		}
	}
	rows, err = tx.Query(`SELECT ca.event_id,ca.place,cr.captured_at_unix_ms
		FROM chute_assignments ca
		JOIN companion_requests cr
		  ON cr.race_id=ca.race_id
		 AND cr.event_id=ca.event_id
		 AND cr.assigned_place=ca.place
		 AND cr.value=ca.bib_number
		 AND cr.operation='bib'
		 AND cr.undone_at_unix_ms IS NULL
		WHERE ca.race_id=? AND ca.unofficial_time=''`, raceID)
	if err != nil {
		return err
	}
	type chuteCapture struct {
		eventID int
		place   int
		at      int64
	}
	var chuteCaptures []chuteCapture
	for rows.Next() {
		var capture chuteCapture
		if err := rows.Scan(&capture.eventID, &capture.place, &capture.at); err != nil {
			rows.Close()
			return err
		}
		chuteCaptures = append(chuteCaptures, capture)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, capture := range chuteCaptures {
		if capture.at < start.UnixMilli() {
			return fmt.Errorf("a queued bib capture precedes the race start; recalibrate before syncing the start")
		}
		if _, err := tx.Exec(`UPDATE chute_assignments SET unofficial_time=?
			WHERE race_id=? AND event_id=? AND place=? AND unofficial_time=''`,
			formatElapsed(capture.at-start.UnixMilli()), raceID, capture.eventID, capture.place); err != nil {
			return err
		}
	}
	return nil
}

func backfillCompanionChuteTimes(db *sql.DB) error {
	rows, err := db.Query(`SELECT ca.race_id,ca.event_id,ca.place,cr.captured_at_unix_ms,r.start_time
		FROM chute_assignments ca
		JOIN companion_requests cr
		  ON cr.race_id=ca.race_id
		 AND cr.event_id=ca.event_id
		 AND cr.assigned_place=ca.place
		 AND cr.value=ca.bib_number
		 AND cr.operation='bib'
		 AND cr.undone_at_unix_ms IS NULL
		JOIN races r ON r.id=ca.race_id
		WHERE ca.unofficial_time='' AND r.start_time IS NOT NULL`)
	if err != nil {
		return err
	}
	type pendingChuteTime struct {
		raceID  int
		eventID int
		place   int
		at      int64
		start   time.Time
	}
	var pending []pendingChuteTime
	for rows.Next() {
		var capture pendingChuteTime
		if err := rows.Scan(&capture.raceID, &capture.eventID, &capture.place, &capture.at, &capture.start); err != nil {
			rows.Close()
			return err
		}
		if capture.at >= capture.start.UnixMilli() {
			pending = append(pending, capture)
		}
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if len(pending) == 0 {
		return nil
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, capture := range pending {
		if _, err := tx.Exec(`UPDATE chute_assignments SET unofficial_time=?
			WHERE race_id=? AND event_id=? AND place=? AND unofficial_time=''`,
			formatElapsed(capture.at-capture.start.UnixMilli()), capture.raceID, capture.eventID, capture.place); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *CompanionService) Undo(token, requestID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, err := s.authenticateLocked(token)
	if err != nil {
		return err
	}
	var operation, value string
	var place int
	var undone sql.NullInt64
	err = s.db.QueryRow(`SELECT operation,COALESCE(assigned_place,0),value,undone_at_unix_ms FROM companion_requests WHERE request_id=? AND device_id=?`, requestID, id.DeviceID).Scan(&operation, &place, &value, &undone)
	if err != nil {
		return err
	}
	if undone.Valid || operation == "start" {
		return fmt.Errorf("entry cannot be undone")
	}
	role := operation
	if role == "time" {
		role = "timer"
	}
	if err := s.requireLeaseLocked(id, role); err != nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var max int
	table := "timing_pulses"
	if operation == "bib" {
		table = "chute_assignments"
	}
	if err := tx.QueryRow("SELECT COALESCE(MAX(place),0) FROM "+table+" WHERE race_id=? AND event_id=?", id.Session.RaceID, id.Session.EventID).Scan(&max); err != nil {
		return err
	}
	if max != place {
		return fmt.Errorf("only the latest entry can be undone")
	}
	if _, err = tx.Exec("DELETE FROM "+table+" WHERE race_id=? AND event_id=? AND place=?", id.Session.RaceID, id.Session.EventID, place); err != nil {
		return err
	}
	if _, err = tx.Exec("UPDATE companion_requests SET undone_at_unix_ms=? WHERE request_id=?", time.Now().UnixMilli(), requestID); err != nil {
		return err
	}
	return tx.Commit()
}
