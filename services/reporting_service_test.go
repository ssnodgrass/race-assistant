package services

import "testing"

func TestParseCustomBibLabelEntries(t *testing.T) {
	entries, err := parseCustomBibLabelEntries("1502-1504, 1433\n1098 1083")
	if err != nil {
		t.Fatalf("parseCustomBibLabelEntries returned error: %v", err)
	}

	got := make([]string, 0, len(entries))
	for _, entry := range entries {
		got = append(got, entry.Bib)
	}
	want := []string{"1502", "1503", "1504", "1433", "1098", "1083"}
	if len(got) != len(want) {
		t.Fatalf("got %d entries, want %d: %v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("entry %d = %q, want %q; all entries: %v", i, got[i], want[i], got)
		}
	}
}

func TestParseCustomBibLabelEntriesRequiresBib(t *testing.T) {
	if _, err := parseCustomBibLabelEntries(" , \n "); err == nil {
		t.Fatal("parseCustomBibLabelEntries returned nil error for empty list")
	}
}
