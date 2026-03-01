package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/ssnodgrass/race-assistant/models"
)

type EventRepository struct {
	db *sql.DB
}

func NewEventRepository(db *sql.DB) *EventRepository {
	return &EventRepository{db: db}
}

func (r *EventRepository) SetDB(db *sql.DB) {
	r.db = db
}

func (r *EventRepository) GetDB() *sql.DB {
	return r.db
}

func (r *EventRepository) checkDB() error {
	if r.db == nil {
		return fmt.Errorf("no database connection")
	}
	return nil
}

func (r *EventRepository) Create(ev *models.Event) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	res, err := r.db.Exec("INSERT INTO events (race_id, name, distance_km, runsignup_event_id) VALUES (?, ?, ?, ?)",
		ev.RaceID, ev.Name, ev.DistanceKM, ev.RunSignUpEventID)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	ev.ID = int(id)
	return nil
}

func (r *EventRepository) ListByRace(raceID int) ([]models.Event, error) {
	if err := r.checkDB(); err != nil {
		return nil, err
	}
	rows, err := r.db.Query("SELECT id, race_id, name, distance_km, COALESCE(runsignup_event_id, '') FROM events WHERE race_id = ?", raceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var events []models.Event
	for rows.Next() {
		var ev models.Event
		if err := rows.Scan(&ev.ID, &ev.RaceID, &ev.Name, &ev.DistanceKM, &ev.RunSignUpEventID); err != nil {
			return nil, err
		}
		events = append(events, ev)
	}
	return events, nil
}

func (r *EventRepository) GetByID(id int) (*models.Event, error) {
	if err := r.checkDB(); err != nil {
		return nil, err
	}
	var ev models.Event
	err := r.db.QueryRow("SELECT id, race_id, name, distance_km, COALESCE(runsignup_event_id, '') FROM events WHERE id = ?", id).
		Scan(&ev.ID, &ev.RaceID, &ev.Name, &ev.DistanceKM, &ev.RunSignUpEventID)
	if err != nil {
		return nil, err
	}
	return &ev, nil
}

func (r *EventRepository) Update(ev *models.Event) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	_, err := r.db.Exec("UPDATE events SET name=?, distance_km=?, runsignup_event_id=? WHERE id=?",
		ev.Name, ev.DistanceKM, ev.RunSignUpEventID, ev.ID)
	return err
}

func (r *EventRepository) Delete(id int) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	_, err := r.db.Exec("DELETE FROM events WHERE id = ?", id)
	return err
}

func (r *EventRepository) HasParticipants(id int) (bool, error) {
	if err := r.checkDB(); err != nil {
		return false, err
	}
	var count int
	err := r.db.QueryRow("SELECT COUNT(*) FROM participants WHERE event_id = ?", id).Scan(&count)
	return count > 0, err
}

func (r *EventRepository) GetAwardConfig(eventID int) (*models.AwardConfig, error) {
	if err := r.checkDB(); err != nil {
		return nil, err
	}
	var config models.AwardConfig
	var ageGroupsJSON sql.NullString
	err := r.db.QueryRow(`SELECT event_id, overall_count, masters_age, masters_count, grand_masters_age, grand_masters_count, 
		senior_grand_masters_age, senior_grand_masters_count, age_group_depth, include_overall, include_masters, 
		include_grand_masters, include_senior_grand_masters, split_gender, award_strategy, age_groups_json 
		FROM award_configs WHERE event_id = ?`, eventID).
		Scan(&config.EventID, &config.OverallCount, &config.MastersAge, &config.MastersCount, &config.GrandMastersAge, &config.GrandMastersCount,
			&config.SeniorGrandMastersAge, &config.SeniorGrandMastersCount, &config.AgeGroupDepth, &config.IncludeOverall, &config.IncludeMasters,
			&config.IncludeGrandMasters, &config.IncludeSeniorGrandMasters, &config.SplitGender, &config.AwardStrategy, &ageGroupsJSON)

	if err == sql.ErrNoRows {
		return &models.AwardConfig{
			EventID:        eventID,
			OverallCount:   3,
			MastersAge:     40,
			MastersCount:   1,
			AgeGroupDepth:  3,
			IncludeOverall: true,
			IncludeMasters: true,
			SplitGender:    true,
			AgeGroups:      []models.AgeGroup{},
		}, nil
	}
	if err != nil {
		return nil, err
	}

	if ageGroupsJSON.Valid && ageGroupsJSON.String != "" {
		json.Unmarshal([]byte(ageGroupsJSON.String), &config.AgeGroups)
	}

	return &config, nil
}

func (r *EventRepository) UpsertAwardConfig(config *models.AwardConfig) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	
	ageGroupsJSON, _ := json.Marshal(config.AgeGroups)

	_, err := r.db.Exec(`INSERT OR REPLACE INTO award_configs 
		(event_id, overall_count, masters_age, masters_count, grand_masters_age, grand_masters_count, 
		 senior_grand_masters_age, senior_grand_masters_count, age_group_depth, include_overall, 
		 include_masters, include_grand_masters, include_senior_grand_masters, split_gender, award_strategy, age_groups_json) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		config.EventID, config.OverallCount, config.MastersAge, config.MastersCount, config.GrandMastersAge, config.GrandMastersCount,
		config.SeniorGrandMastersAge, config.SeniorGrandMastersCount, config.AgeGroupDepth, config.IncludeOverall,
		config.IncludeMasters, config.IncludeGrandMasters, config.IncludeSeniorGrandMasters, config.SplitGender, config.AwardStrategy, string(ageGroupsJSON))
	return err
}
