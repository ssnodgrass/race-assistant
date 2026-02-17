package repository

import (
	"database/sql"
	"fmt"

	"github.com/ssnodgrass/race-assistant/models"
)

type TimingRepository struct {
	db *sql.DB
}

func NewTimingRepository(db *sql.DB) *TimingRepository {
	return &TimingRepository{db: db}
}

func (r *TimingRepository) SetDB(db *sql.DB) {
	r.db = db
}

func (r *TimingRepository) checkDB() error {
	if r.db == nil {
		return fmt.Errorf("no database connection")
	}
	return nil
}

func (r *TimingRepository) CreatePulse(p *models.TimingPulse) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	res, err := r.db.Exec("INSERT INTO timing_pulses (race_id, place, raw_time) VALUES (?, ?, ?)",
		p.RaceID, p.Place, p.RawTime)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	p.ID = int(id)
	return nil
}

func (r *TimingRepository) UpdatePulse(p *models.TimingPulse) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	_, err := r.db.Exec("UPDATE timing_pulses SET place=?, raw_time=? WHERE id=?",
		p.Place, p.RawTime, p.ID)
	return err
}

func (r *TimingRepository) DeletePulse(id int) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	_, err := r.db.Exec("DELETE FROM timing_pulses WHERE id = ?", id)
	return err
}

func (r *TimingRepository) ListPulses(raceID int) ([]models.TimingPulse, error) {
	if err := r.checkDB(); err != nil {
		return nil, err
	}
	rows, err := r.db.Query("SELECT id, race_id, place, raw_time FROM timing_pulses WHERE race_id = ? ORDER BY place ASC", raceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var pulses []models.TimingPulse
	for rows.Next() {
		var p models.TimingPulse
		if err := rows.Scan(&p.ID, &p.RaceID, &p.Place, &p.RawTime); err != nil {
			return nil, err
		}
		pulses = append(pulses, p)
	}
	return pulses, nil
}

func (r *TimingRepository) GetBibAssignment(raceID int, bibNumber string) (int, error) {
	if err := r.checkDB(); err != nil {
		return 0, err
	}
	var place int
	err := r.db.QueryRow("SELECT place FROM chute_assignments WHERE race_id = ? AND bib_number = ?", raceID, bibNumber).Scan(&place)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return place, err
}

func (r *TimingRepository) UpsertChuteAssignment(ca *models.ChuteAssignment) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	_, err := r.db.Exec("INSERT OR REPLACE INTO chute_assignments (race_id, place, bib_number) VALUES (?, ?, ?)",
		ca.RaceID, ca.Place, ca.BibNumber)
	return err
}

func (r *TimingRepository) DeleteChuteAssignment(raceID, place int) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	_, err := r.db.Exec("DELETE FROM chute_assignments WHERE race_id = ? AND place = ?", raceID, place)
	return err
}

func (r *TimingRepository) DeleteBibAssignment(raceID int, bibNumber string) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	_, err := r.db.Exec("DELETE FROM chute_assignments WHERE race_id = ? AND bib_number = ?", raceID, bibNumber)
	return err
}

// ShiftPlacements moves all records from startPlace onwards by 'delta'
func (r *TimingRepository) ShiftPlacements(raceID int, startPlace int, delta int) error {
	if err := r.checkDB(); err != nil {
		return err
	}

	// SQLite doesn't support ORDER BY in UPDATE. We'll do it manually in a transaction
	// to avoid primary key collisions on (race_id, place).
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Get affected rows
	rows, err := tx.Query("SELECT place, bib_number FROM chute_assignments WHERE race_id = ? AND place >= ? ORDER BY place DESC", raceID, startPlace)
	if delta < 0 {
		// Shifting up: order ASC
		rows, err = tx.Query("SELECT place, bib_number FROM chute_assignments WHERE race_id = ? AND place >= ? ORDER BY place ASC", raceID, startPlace)
	}
	if err != nil {
		return err
	}

	type entry struct {
		p int
		b string
	}
	var entries []entry
	for rows.Next() {
		var e entry
		rows.Scan(&e.p, &e.b)
		entries = append(entries, e)
	}
	rows.Close()

	for _, e := range entries {
		// Delete old, insert new
		_, err = tx.Exec("DELETE FROM chute_assignments WHERE race_id = ? AND place = ?", raceID, e.p)
		if err != nil {
			return err
		}
		_, err = tx.Exec("INSERT INTO chute_assignments (race_id, place, bib_number) VALUES (?, ?, ?)", raceID, e.p+delta, e.b)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *TimingRepository) ListPlacements(raceID int) ([]models.ChuteAssignment, error) {
	if err := r.checkDB(); err != nil {
		return nil, err
	}
	rows, err := r.db.Query("SELECT race_id, place, bib_number FROM chute_assignments WHERE race_id = ? ORDER BY place ASC", raceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var assignments []models.ChuteAssignment
	for rows.Next() {
		var ca models.ChuteAssignment
		if err := rows.Scan(&ca.RaceID, &ca.Place, &ca.BibNumber); err != nil {
			return nil, err
		}
		assignments = append(assignments, ca)
	}
	return assignments, nil
}

func (r *TimingRepository) GetReconciledResultsByRace(raceID int) ([]models.Result, error) {
	if err := r.checkDB(); err != nil {
		return nil, err
	}
	query := `
		SELECT 
			ca.place as chute_place, 
			p.bib_number, 
			p.first_name, 
			p.last_name, 
			p.gender, 
			p.age_on_race_day, 
			COALESCE(tp.raw_time, ''),
			p.event_id
		FROM chute_assignments ca
		JOIN participants p ON ca.race_id = p.race_id AND ca.bib_number = p.bib_number
		LEFT JOIN timing_pulses tp ON ca.race_id = tp.race_id AND ca.place = tp.place
		WHERE ca.race_id = ?
		ORDER BY ca.place ASC
	`
	rows, err := r.db.Query(query, raceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.Result
	for rows.Next() {
		var res models.Result
		var bib, fname, lname, gender, time sql.NullString
		var age, eventID sql.NullInt64
		if err := rows.Scan(&res.ChutePlace, &bib, &fname, &lname, &gender, &age, &time, &eventID); err != nil {
			return nil, err
		}
		res.BibNumber = bib.String
		res.FirstName = fname.String
		res.LastName = lname.String
		res.Gender = gender.String
		res.Age = int(age.Int64)
		res.Time = time.String
		results = append(results, res)
	}
	return results, nil
}

func (r *TimingRepository) GetReconciledResultsByEvent(eventID int) ([]models.Result, error) {
	if err := r.checkDB(); err != nil {
		return nil, err
	}
	query := `
		SELECT 
			ca.place as chute_place, 
			p.bib_number, 
			p.first_name, 
			p.last_name, 
			p.gender, 
			p.age_on_race_day, 
			COALESCE(tp.raw_time, '')
		FROM chute_assignments ca
		JOIN participants p ON ca.race_id = p.race_id AND ca.bib_number = p.bib_number
		LEFT JOIN timing_pulses tp ON ca.race_id = tp.race_id AND ca.place = tp.place
		WHERE p.event_id = ?
		ORDER BY ca.place ASC
	`
	rows, err := r.db.Query(query, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.Result
	for rows.Next() {
		var res models.Result
		var bib, fname, lname, gender, time sql.NullString
		var age sql.NullInt64
		if err := rows.Scan(&res.ChutePlace, &bib, &fname, &lname, &gender, &age, &time); err != nil {
			return nil, err
		}
		res.BibNumber = bib.String
		res.FirstName = fname.String
		res.LastName = lname.String
		res.Gender = gender.String
		res.Age = int(age.Int64)
		res.Time = time.String
		results = append(results, res)
	}
	return results, nil
}
