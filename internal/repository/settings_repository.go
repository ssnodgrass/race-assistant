package repository

import (
	"database/sql"
	"fmt"
)

type SettingsRepository struct {
	db *sql.DB
}

func NewSettingsRepository(db *sql.DB) *SettingsRepository {
	return &SettingsRepository{db: db}
}

func (r *SettingsRepository) SetDB(db *sql.DB) {
	r.db = db
}

func (r *SettingsRepository) GetDB() *sql.DB {
	return r.db
}

func (r *SettingsRepository) checkDB() error {
	if r.db == nil {
		return fmt.Errorf("no database connection")
	}
	return nil
}

func (r *SettingsRepository) Set(key string, value string) error {
	if err := r.checkDB(); err != nil {
		return err
	}
	_, err := r.db.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, value)
	return err
}

func (r *SettingsRepository) Get(key string) (string, error) {
	if err := r.checkDB(); err != nil {
		return "", err
	}
	var value string
	err := r.db.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}
