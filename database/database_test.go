package database

import (
	"database/sql"
	"testing"
)

func TestRunMigrationsUpgradesExistingCheckInPreviewDatabase(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if _, err := db.Exec(`
		CREATE TABLE participants (id INTEGER PRIMARY KEY);
		CREATE TABLE migrations (version INTEGER PRIMARY KEY);
		INSERT INTO migrations(version) VALUES (5);
	`); err != nil {
		t.Fatal(err)
	}
	if err := RunMigrations(db); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	var shirtSizeColumns int
	if err := db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('participants') WHERE name='shirt_size'`).Scan(&shirtSizeColumns); err != nil {
		t.Fatal(err)
	}
	if shirtSizeColumns != 1 {
		t.Fatalf("shirt_size columns = %d, want 1", shirtSizeColumns)
	}
}
