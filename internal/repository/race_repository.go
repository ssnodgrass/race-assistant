package repository

import (
	"database/sql"
	"fmt"

	"github.com/ssnodgrass/race-assistant/models"
)

type RaceRepository struct {
	db *sql.DB
}

func NewRaceRepository(db *sql.DB) *RaceRepository {
	return &RaceRepository{db: db}
}

func (r *RaceRepository) SetDB(db *sql.DB) {
	r.db = db
}

func (r *RaceRepository) checkDB() error {
	if r.db == nil {
		return fmt.Errorf("no database connection")
	}
	return nil
}

// Race CRUD
func (r *RaceRepository) Create(race *models.Race) error {
	if err := r.checkDB(); err != nil { return err }
	res, err := r.db.Exec(`INSERT INTO races (name, date, start_time, runsignup_race_id) 
		VALUES (?, ?, ?, ?)`,
		race.Name, race.Date, race.StartTime, race.RSU.RaceID)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	race.ID = int(id)
	return nil
}

func (r *RaceRepository) GetByID(id int) (*models.Race, error) {
	if err := r.checkDB(); err != nil { return nil, err }
	var race models.Race
	err := r.db.QueryRow(`SELECT id, name, date, start_time, COALESCE(runsignup_race_id, '') 
		FROM races WHERE id = ?`, id).
		Scan(&race.ID, &race.Name, &race.Date, &race.StartTime, &race.RSU.RaceID)
	if err != nil {
		return nil, err
	}
	return &race, nil
}

func (r *RaceRepository) Update(race *models.Race) error {
	if err := r.checkDB(); err != nil { return err }
	_, err := r.db.Exec(`UPDATE races SET name=?, date=?, start_time=?, runsignup_race_id=? WHERE id=?`,
		race.Name, race.Date, race.StartTime, race.RSU.RaceID, race.ID)
	return err
}

func (r *RaceRepository) Delete(id int) error {
	if err := r.checkDB(); err != nil { return err }
	_, err := r.db.Exec("DELETE FROM races WHERE id = ?", id)
	return err
}

func (r *RaceRepository) List() ([]models.Race, error) {
	if err := r.checkDB(); err != nil { return nil, err }
	rows, err := r.db.Query(`SELECT id, name, date, start_time, COALESCE(runsignup_race_id, '') FROM races`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var races []models.Race
	for rows.Next() {
		var rc models.Race
		if err := rows.Scan(&rc.ID, &rc.Name, &rc.Date, &rc.StartTime, &rc.RSU.RaceID); err != nil {
			return nil, err
		}
		races = append(races, rc)
	}
	return races, nil
}
