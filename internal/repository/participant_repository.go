package repository

import (
	"database/sql"
	"fmt"

	"github.com/ssnodgrass/race-assistant/models"
)

type ParticipantRepository struct {
	db *sql.DB
}

func NewParticipantRepository(db *sql.DB) *ParticipantRepository {
	return &ParticipantRepository{db: db}
}

func (r *ParticipantRepository) SetDB(db *sql.DB) {
	r.db = db
}

func (r *ParticipantRepository) checkDB() error {
	if r.db == nil {
		return fmt.Errorf("no database connection")
	}
	return nil
}

func (r *ParticipantRepository) Create(p *models.Participant) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	res, err := r.db.Exec(`INSERT INTO participants (race_id, event_id, bib_number, first_name, last_name, gender, dob, age_on_race_day) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		p.RaceID, p.EventID, p.BibNumber, p.FirstName, p.LastName, p.Gender, p.DOB, p.AgeOnRaceDay)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	p.ID = int(id)
	return nil
}

func (r *ParticipantRepository) ListByEvent(eventID int) ([]models.Participant, error) {
	if err := r.checkDB(); err != nil {
		return nil, err
	}
	rows, err := r.db.Query("SELECT id, race_id, event_id, bib_number, first_name, last_name, gender, dob, age_on_race_day FROM participants WHERE event_id = ?", eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.scanParticipants(rows)
}

func (r *ParticipantRepository) ListByRace(raceID int) ([]models.Participant, error) {
	if err := r.checkDB(); err != nil {
		return nil, err
	}
	rows, err := r.db.Query("SELECT id, race_id, event_id, bib_number, first_name, last_name, gender, dob, age_on_race_day FROM participants WHERE race_id = ?", raceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.scanParticipants(rows)
}

func (r *ParticipantRepository) scanParticipants(rows *sql.Rows) ([]models.Participant, error) {
	var participants []models.Participant
	for rows.Next() {
		var p models.Participant
		if err := rows.Scan(&p.ID, &p.RaceID, &p.EventID, &p.BibNumber, &p.FirstName, &p.LastName, &p.Gender, &p.DOB, &p.AgeOnRaceDay); err != nil {
			return nil, err
		}
		participants = append(participants, p)
	}
	return participants, nil
}

func (r *ParticipantRepository) Update(p *models.Participant) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	_, err := r.db.Exec(`UPDATE participants SET event_id=?, bib_number=?, first_name=?, last_name=?, gender=?, dob=?, age_on_race_day=? 
		WHERE id=?`,
		p.EventID, p.BibNumber, p.FirstName, p.LastName, p.Gender, p.DOB, p.AgeOnRaceDay, p.ID)
	return err
}

func (r *ParticipantRepository) Delete(id int) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	_, err := r.db.Exec("DELETE FROM participants WHERE id = ?", id)
	return err
}
