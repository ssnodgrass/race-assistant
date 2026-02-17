package database

import (
	"database/sql"
	"embed"
	"fmt"
	"sort"
	"strings"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Connect opens a connection to the database file and runs migrations.
func Connect(filepath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", filepath)
	if err != nil {
		return nil, err
	}
	if err := RunMigrations(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func RunMigrations(db *sql.DB) error {
	// Ensure migrations table exists
	_, err := db.Exec("CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY)")
	if err != nil {
		return err
	}

	// Get current version
	var currentVersion int
	err = db.QueryRow("SELECT MAX(version) FROM migrations").Scan(&currentVersion)
	if err != nil && err != sql.ErrNoRows {
		currentVersion = 0
	}

	// Read migration files
	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		return err
	}

	var files []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)

	for i, file := range files {
		version := i + 1
		if version <= currentVersion {
			continue
		}

		content, err := migrationFiles.ReadFile("migrations/" + file)
		if err != nil {
			return err
		}

		tx, err := db.Begin()
		if err != nil {
			return err
		}

		if _, err := tx.Exec(string(content)); err != nil {
			tx.Rollback()
			return fmt.Errorf("error in %s: %w", file, err)
		}

		if _, err := tx.Exec("INSERT INTO migrations (version) VALUES (?)", version); err != nil {
			tx.Rollback()
			return err
		}

		if err := tx.Commit(); err != nil {
			return err
		}
	}

	return nil
}
