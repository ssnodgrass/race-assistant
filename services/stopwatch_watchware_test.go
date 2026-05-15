package services

import (
	"fmt"
	"strings"
	"testing"
)

func TestParseWatchwareExport_ReordersWrappedMemorySlots(t *testing.T) {
	selected, segments, meta, err := parseWatchwareExport(buildWrappedWatchwareExportFixture(), false)
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
	selected, segments, meta, err := parseWatchwareExport(buildWrappedWatchwareExportFixture(), true)
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

func buildWrappedWatchwareExportFixture() string {
	times := make([]int, 80)
	for i := range times {
		times[i] = i * 100
	}

	// Preserve the validated values we care about from the real export behavior.
	times[1] = 108946
	for i := 2; i < 27; i++ {
		times[i] = times[i-1] + 100
	}
	times[27] = 171179
	for i := 28; i < 79; i++ {
		times[i] = times[i-1] + 100
	}
	times[78] = 340502
	times[79] = 467773

	var b strings.Builder
	b.WriteString("Segment\tMem\tCum Time\n")

	// Emit wrapped memory slots to match the watch export pattern.
	for mem := 28; mem <= 79; mem++ {
		fmt.Fprintf(&b, "1\tT%03d\t%.2f\n", mem, float64(times[mem])/100)
	}
	for mem := 0; mem <= 27; mem++ {
		fmt.Fprintf(&b, "1\tT%03d\t%.2f\n", mem, float64(times[mem])/100)
	}

	return b.String()
}
