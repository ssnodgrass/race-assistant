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

func (r *TimingRepository) GetDB() *sql.DB {
	return r.db
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
	res, err := r.db.Exec("INSERT INTO timing_pulses (race_id, event_id, place, raw_time) VALUES (?, ?, ?, ?)",
		p.RaceID, p.EventID, p.Place, p.RawTime)
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
	_, err := r.db.Exec("UPDATE timing_pulses SET event_id=?, place=?, raw_time=? WHERE id=?",
		p.EventID, p.Place, p.RawTime, p.ID)
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
	return r.listPulsesWhere("WHERE race_id = ?", raceID)
}

func (r *TimingRepository) ListPulsesByEvent(raceID, eventID int) ([]models.TimingPulse, error) {
	return r.listPulsesWhere("WHERE race_id = ? AND event_id = ?", raceID, eventID)
}

func (r *TimingRepository) listPulsesWhere(where string, args ...interface{}) ([]models.TimingPulse, error) {
	if err := r.checkDB(); err != nil {
		return nil, err
	}
	query := "SELECT id, race_id, event_id, place, raw_time FROM timing_pulses " + where + " ORDER BY place ASC"
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var pulses []models.TimingPulse
	for rows.Next() {
		var p models.TimingPulse
		if err := rows.Scan(&p.ID, &p.RaceID, &p.EventID, &p.Place, &p.RawTime); err != nil {
			return nil, err
		}
		pulses = append(pulses, p)
	}
	return pulses, nil
}

func (r *TimingRepository) DeletePulses(raceID int, eventID int) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	if eventID > 0 {
		_, err := r.db.Exec("DELETE FROM timing_pulses WHERE race_id = ? AND event_id = ?", raceID, eventID)
		return err
	}
	_, err := r.db.Exec("DELETE FROM timing_pulses WHERE race_id = ?", raceID)
	return err
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
	_, err := r.db.Exec("INSERT OR REPLACE INTO chute_assignments (race_id, event_id, place, bib_number, unofficial_time) VALUES (?, ?, ?, ?, ?)",
		ca.RaceID, ca.EventID, ca.Place, ca.BibNumber, ca.UnofficialTime)
	return err
}

func (r *TimingRepository) DeleteChuteAssignment(raceID, place int) error {
	return r.DeleteChuteAssignmentByEvent(raceID, 0, place)
}

func (r *TimingRepository) DeleteChuteAssignmentByEvent(raceID, eventID, place int) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	if eventID > 0 {
		_, err := r.db.Exec("DELETE FROM chute_assignments WHERE race_id = ? AND event_id = ? AND place = ?", raceID, eventID, place)
		return err
	}
	_, err := r.db.Exec("DELETE FROM chute_assignments WHERE race_id = ? AND event_id = 0 AND place = ?", raceID, place)
	return err
}

func (r *TimingRepository) DeleteBibAssignment(raceID int, bibNumber string) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	_, err := r.db.Exec("DELETE FROM chute_assignments WHERE race_id = ? AND bib_number = ?", raceID, bibNumber)
	return err
}

func (r *TimingRepository) ShiftPlacements(raceID int, startPlace int, delta int) error {
	return r.ShiftPlacementsByEvent(raceID, 0, startPlace, delta)
}

func (r *TimingRepository) ShiftPlacementsByEvent(raceID int, eventID int, startPlace int, delta int) error {
	if err := r.checkDB(); err != nil {
		return err
	}

	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	rows, err := tx.Query("SELECT place, bib_number, unofficial_time FROM chute_assignments WHERE race_id = ? AND event_id = ? AND place >= ? ORDER BY place DESC", raceID, eventID, startPlace)
	if delta < 0 {
		rows, err = tx.Query("SELECT place, bib_number, unofficial_time FROM chute_assignments WHERE race_id = ? AND event_id = ? AND place >= ? ORDER BY place ASC", raceID, eventID, startPlace)
	}
	if err != nil {
		return err
	}

	type entry struct {
		p int
		b string
		t string
	}
	var entries []entry
	for rows.Next() {
		var e entry
		rows.Scan(&e.p, &e.b, &e.t)
		entries = append(entries, e)
	}
	rows.Close()

	for _, e := range entries {
		_, err = tx.Exec("DELETE FROM chute_assignments WHERE race_id = ? AND event_id = ? AND place = ?", raceID, eventID, e.p)
		if err != nil {
			return err
		}
		_, err = tx.Exec("INSERT INTO chute_assignments (race_id, event_id, place, bib_number, unofficial_time) VALUES (?, ?, ?, ?, ?)", raceID, eventID, e.p+delta, e.b, e.t)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *TimingRepository) ListPlacements(raceID int) ([]models.ChuteAssignment, error) {
	return r.listPlacementsWhere("WHERE race_id = ? AND event_id = 0", raceID)
}

func (r *TimingRepository) ListPlacementsByEvent(raceID, eventID int) ([]models.ChuteAssignment, error) {
	if eventID > 0 {
		return r.listPlacementsWhere("WHERE race_id = ? AND event_id = ?", raceID, eventID)
	}
	return r.listPlacementsWhere("WHERE race_id = ? AND event_id = 0", raceID)
}

func (r *TimingRepository) listPlacementsWhere(where string, args ...interface{}) ([]models.ChuteAssignment, error) {
	if err := r.checkDB(); err != nil {
		return nil, err
	}
	query := "SELECT race_id, event_id, place, bib_number, unofficial_time FROM chute_assignments " + where + " ORDER BY place ASC"
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var assignments []models.ChuteAssignment
	for rows.Next() {
		var ca models.ChuteAssignment
		if err := rows.Scan(&ca.RaceID, &ca.EventID, &ca.Place, &ca.BibNumber, &ca.UnofficialTime); err != nil {
			return nil, err
		}
		assignments = append(assignments, ca)
	}
	return assignments, nil
}

func (r *TimingRepository) DeletePlacements(raceID int, eventID int) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	if eventID > 0 {
		_, err := r.db.Exec("DELETE FROM chute_assignments WHERE race_id = ? AND event_id = ?", raceID, eventID)
		return err
	}
	_, err := r.db.Exec("DELETE FROM chute_assignments WHERE race_id = ?", raceID)
	return err
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
			COALESCE(ca.unofficial_time, ''),
			p.event_id
		FROM chute_assignments ca
		JOIN participants p ON ca.race_id = p.race_id AND ca.bib_number = p.bib_number AND (ca.event_id = p.event_id OR ca.event_id = 0)
		LEFT JOIN timing_pulses tp ON ca.race_id = tp.race_id AND ca.place = tp.place AND (tp.event_id = ca.event_id OR ca.event_id = 0 OR tp.event_id = 0)
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
		var bib, fname, lname, gender, time, utime sql.NullString
		var age, eventID sql.NullInt64
		if err := rows.Scan(&res.ChutePlace, &bib, &fname, &lname, &gender, &age, &time, &utime, &eventID); err != nil {
			return nil, err
		}
		res.BibNumber = bib.String
		res.FirstName = fname.String
		res.LastName = lname.String
		res.Gender = gender.String
		res.Age = int(age.Int64)
		res.Time = time.String
		res.UnofficialTime = utime.String
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
			COALESCE(tp.raw_time, ''),
			COALESCE(ca.unofficial_time, '')
		FROM chute_assignments ca
		JOIN participants p ON ca.race_id = p.race_id AND ca.bib_number = p.bib_number AND (ca.event_id = p.event_id OR ca.event_id = 0)
		LEFT JOIN timing_pulses tp ON ca.race_id = tp.race_id AND ca.place = tp.place AND (tp.event_id = p.event_id OR tp.event_id = 0)
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
		var bib, fname, lname, gender, time, utime sql.NullString
		var age sql.NullInt64
		if err := rows.Scan(&res.ChutePlace, &bib, &fname, &lname, &gender, &age, &time, &utime); err != nil {
			return nil, err
		}
		res.BibNumber = bib.String
		res.FirstName = fname.String
		res.LastName = lname.String
		res.Gender = gender.String
		res.Age = int(age.Int64)
		res.Time = time.String
		res.UnofficialTime = utime.String
		results = append(results, res)
	}
	return results, nil
}
