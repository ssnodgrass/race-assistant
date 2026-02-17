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

func (r *EventRepository) checkDB() error {
	if r.db == nil {
		return fmt.Errorf("no database connection")
	}
	return nil
}

func (r *EventRepository) Create(e *models.Event) error {
	if err := r.checkDB(); err != nil { return err }
	res, err := r.db.Exec("INSERT INTO events (race_id, name, distance_km) VALUES (?, ?, ?)",
		e.RaceID, e.Name, e.DistanceKM)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	e.ID = int(id)
	return nil
}

func (r *EventRepository) GetByID(id int) (*models.Event, error) {
	if err := r.checkDB(); err != nil { return nil, err }
	var e models.Event
	err := r.db.QueryRow("SELECT id, race_id, name, distance_km FROM events WHERE id = ?", id).
		Scan(&e.ID, &e.RaceID, &e.Name, &e.DistanceKM)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (r *EventRepository) ListByRace(raceID int) ([]models.Event, error) {
	if err := r.checkDB(); err != nil { return nil, err }
	rows, err := r.db.Query("SELECT id, race_id, name, distance_km FROM events WHERE race_id = ?", raceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var events []models.Event
	for rows.Next() {
		var e models.Event
		if err := rows.Scan(&e.ID, &e.RaceID, &e.Name, &e.DistanceKM); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}

func (r *EventRepository) Update(e *models.Event) error {
	if err := r.checkDB(); err != nil { return err }
	_, err := r.db.Exec("UPDATE events SET name=?, distance_km=? WHERE id=?", e.Name, e.DistanceKM, e.ID)
	return err
}

func (r *EventRepository) Delete(id int) error {
	if err := r.checkDB(); err != nil { return err }
	_, err := r.db.Exec("DELETE FROM events WHERE id = ?", id)
	return err
}

func (r *EventRepository) HasParticipants(id int) (bool, error) {
	if err := r.checkDB(); err != nil { return false, err }
	var count int
	err := r.db.QueryRow("SELECT COUNT(*) FROM participants WHERE event_id = ?", id).Scan(&count)
	return count > 0, err
}

func (r *EventRepository) GetAwardConfig(eventID int) (*models.AwardConfig, error) {
	if err := r.checkDB(); err != nil { return nil, err }
	var c models.AwardConfig
	var ageGroupsJSON sql.NullString
	err := r.db.QueryRow(`SELECT event_id, overall_count, masters_age, masters_count, grand_masters_age, grand_masters_count, 
		senior_grand_masters_age, senior_grand_masters_count, age_group_depth, include_overall, include_masters, 
		include_grand_masters, include_senior_grand_masters, split_gender, award_strategy, age_groups_json
		FROM award_configs WHERE event_id = ?`, eventID).Scan(
		&c.EventID, &c.OverallCount, &c.MastersAge, &c.MastersCount, &c.GrandMastersAge, &c.GrandMastersCount,
		&c.SeniorGrandMastersAge, &c.SeniorGrandMastersCount, &c.AgeGroupDepth, &c.IncludeOverall, &c.IncludeMasters,
		&c.IncludeGrandMasters, &c.IncludeSeniorGrandMasters, &c.SplitGender, &c.AwardStrategy, &ageGroupsJSON,
	)
	if err == sql.ErrNoRows {
		return &models.AwardConfig{
			EventID: eventID, OverallCount: 3, MastersAge: 40, MastersCount: 1,
			AgeGroupDepth: 3, IncludeOverall: true, IncludeMasters: true, SplitGender: true,
			AwardStrategy: models.AwardStrategyPrestigious,
			AgeGroups:     []models.AgeGroup{{Min: 0, Max: 19}, {Min: 20, Max: 29}, {Min: 30, Max: 39}, {Min: 40, Max: 49}, {Min: 50, Max: 59}, {Min: 60, Max: 99}},
		}, nil
	}
	if ageGroupsJSON.Valid && ageGroupsJSON.String != "" {
		json.Unmarshal([]byte(ageGroupsJSON.String), &c.AgeGroups)
	}
	return &c, err
}

func (r *EventRepository) UpsertAwardConfig(c *models.AwardConfig) error {
	if err := r.checkDB(); err != nil { return err }
	ageGroupsJSON, _ := json.Marshal(c.AgeGroups)
	_, err := r.db.Exec(`INSERT OR REPLACE INTO award_configs (
		event_id, overall_count, masters_age, masters_count, grand_masters_age, grand_masters_count, 
		senior_grand_masters_age, senior_grand_masters_count, age_group_depth, include_overall, include_masters, 
		include_grand_masters, include_senior_grand_masters, split_gender, award_strategy, age_groups_json
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.EventID, c.OverallCount, c.MastersAge, c.MastersCount, c.GrandMastersAge, c.GrandMastersCount,
		c.SeniorGrandMastersAge, c.SeniorGrandMastersCount, c.AgeGroupDepth, c.IncludeOverall, c.IncludeMasters,
		c.IncludeGrandMasters, &c.IncludeSeniorGrandMasters, c.SplitGender, c.AwardStrategy, string(ageGroupsJSON))
	return err
}
