package services

import (
	"os"
	"testing"
)

func TestParseWatchwareExport_ReordersWrappedMemorySlots(t *testing.T) {
	content, err := os.ReadFile("../NkDataExport20260515.txt")
	if err != nil {
		t.Fatalf("failed to read sample export: %v", err)
	}

	selected, segments, meta, err := parseWatchwareExport(string(content), false)
	if err != nil {
		t.Fatalf("parseWatchwareExport failed: %v", err)
	}

	if meta["segmentCount"] != 1 {
		t.Fatalf("segmentCount mismatch: got %v want 1", meta["segmentCount"])
	}
	if meta["selectedSegment"] != 1 {
		t.Fatalf("selectedSegment mismatch: got %v want 1", meta["selectedSegment"])
	}

	segmentTimes, ok := segments[1]
	if !ok {
		t.Fatalf("segment 1 missing from parsed segments")
	}
	if len(segmentTimes) != 78 {
		t.Fatalf("segment 1 parsed %d times, want 78", len(segmentTimes))
	}
	if len(selected) != 78 {
		t.Fatalf("selected parsed %d times, want 78", len(selected))
	}

	wantFirst := "00:18:09.46"
	if selected[0].Time != wantFirst {
		t.Fatalf("first imported time mismatch: got %s want %s", selected[0].Time, wantFirst)
	}

	wantWrapBoundary := "00:28:31.79"
	if selected[26].Time != wantWrapBoundary {
		t.Fatalf("wrap boundary mismatch: got %s want %s", selected[26].Time, wantWrapBoundary)
	}

	wantLast := "00:56:45.02"
	if selected[len(selected)-1].Time != wantLast {
		t.Fatalf("last imported time mismatch: got %s want %s", selected[len(selected)-1].Time, wantLast)
	}

	trimmed, ok := meta["trimmedStopSegments"].([]int)
	if !ok {
		t.Fatalf("trimmedStopSegments type mismatch: got %T", meta["trimmedStopSegments"])
	}
	if len(trimmed) != 1 || trimmed[0] != 1 {
		t.Fatalf("trimmedStopSegments mismatch: got %v want [1]", trimmed)
	}
}

func TestParseWatchwareExport_CanIncludeTerminalStop(t *testing.T) {
	content, err := os.ReadFile("../NkDataExport20260515.txt")
	if err != nil {
		t.Fatalf("failed to read sample export: %v", err)
	}

	selected, segments, meta, err := parseWatchwareExport(string(content), true)
	if err != nil {
		t.Fatalf("parseWatchwareExport failed: %v", err)
	}

	segmentTimes, ok := segments[1]
	if !ok {
		t.Fatalf("segment 1 missing from parsed segments")
	}
	if len(segmentTimes) != 79 {
		t.Fatalf("segment 1 parsed %d times, want 79", len(segmentTimes))
	}
	if len(selected) != 79 {
		t.Fatalf("selected parsed %d times, want 79", len(selected))
	}

	wantLast := "01:17:57.73"
	if selected[len(selected)-1].Time != wantLast {
		t.Fatalf("last imported time mismatch: got %s want %s", selected[len(selected)-1].Time, wantLast)
	}

	trimmed, ok := meta["trimmedStopSegments"].([]int)
	if !ok {
		t.Fatalf("trimmedStopSegments type mismatch: got %T", meta["trimmedStopSegments"])
	}
	if len(trimmed) != 0 {
		t.Fatalf("trimmedStopSegments mismatch: got %v want []", trimmed)
	}
}
