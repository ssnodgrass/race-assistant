package services

import (
	"testing"
)

func TestParseUploadedTimes_SingleSegment(t *testing.T) {
	svc := NewStopwatchService(nil)

	raw := buildTestCapture(
		0x92,
		[][]rawRecord{
			{
				{setID: 0, centiseconds: 215},
				{setID: 0, centiseconds: 313},
				{setID: 0, centiseconds: 413},
			},
		},
		1,   // selected segment
		3,   // selected segment record count
		498, // stop time (00:00:04.98)
	)

	got, meta := svc.parseUploadedTimes(raw)

	if len(got) != 3 {
		t.Fatalf("expected 3 parsed records, got %d", len(got))
	}

	want := []string{"00:00:02.15", "00:00:03.13", "00:00:04.13"}
	for i := range want {
		if got[i].Time != want[i] {
			t.Fatalf("record %d time mismatch: got %s want %s", i+1, got[i].Time, want[i])
		}
	}

	if meta["segmentCount"] != 1 {
		t.Fatalf("segmentCount mismatch: got %v want 1", meta["segmentCount"])
	}
	if meta["selectedSegment"] != 1 {
		t.Fatalf("selectedSegment mismatch: got %v want 1", meta["selectedSegment"])
	}
	if meta["selectedSegmentRecords"] != 3 {
		t.Fatalf("selectedSegmentRecords mismatch: got %v want 3", meta["selectedSegmentRecords"])
	}
	if meta["stopTime"] != "00:00:04.98" {
		t.Fatalf("stopTime mismatch: got %v want 00:00:04.98", meta["stopTime"])
	}
}

func TestParseUploadedTimes_MultiSegmentSelectedTrimmed(t *testing.T) {
	svc := NewStopwatchService(nil)

	raw := buildTestCapture(
		0x81,
		[][]rawRecord{
			{
				{setID: 0, centiseconds: 215},
				{setID: 0, centiseconds: 313},
				{setID: 0, centiseconds: 413},
			},
			{
				{setID: 0, centiseconds: 160},
				{setID: 0, centiseconds: 350},
			},
			{
				{setID: 0, centiseconds: 134},
			},
			{
				{setID: 0, centiseconds: 137},
				{setID: 0, centiseconds: 261},
			},
			{
				// First 8 timeline records are the selected segment data.
				{setID: 0, centiseconds: 179},
				{setID: 0, centiseconds: 274},
				{setID: 0, centiseconds: 296},
				{setID: 0, centiseconds: 317},
				{setID: 0, centiseconds: 341},
				{setID: 0, centiseconds: 399},
				{setID: 0, centiseconds: 419},
				{setID: 0, centiseconds: 480},
				// Control + stale records that must not affect parsed count.
				{setID: 0xff20, centiseconds: 4626},
				{setID: 0x1383, centiseconds: 16729},
				{setID: 4, centiseconds: 42573},
				{setID: 5, centiseconds: 45365},
				{setID: 0, centiseconds: 1386},
			},
		},
		5,   // selected segment
		8,   // selected segment record count from footer
		588, // stop time (00:00:05.88)
	)

	got, meta := svc.parseUploadedTimes(raw)

	if len(got) != 8 {
		t.Fatalf("expected 8 parsed records, got %d", len(got))
	}

	want := []string{
		"00:00:01.79",
		"00:00:02.74",
		"00:00:02.96",
		"00:00:03.17",
		"00:00:03.41",
		"00:00:03.99",
		"00:00:04.19",
		"00:00:04.80",
	}
	for i := range want {
		if got[i].Time != want[i] {
			t.Fatalf("record %d time mismatch: got %s want %s", i+1, got[i].Time, want[i])
		}
	}

	if meta["segmentCount"] != 5 {
		t.Fatalf("segmentCount mismatch: got %v want 5", meta["segmentCount"])
	}
	if meta["selectedSegment"] != 5 {
		t.Fatalf("selectedSegment mismatch: got %v want 5", meta["selectedSegment"])
	}
	if meta["selectedSegmentRecords"] != 8 {
		t.Fatalf("selectedSegmentRecords mismatch: got %v want 8", meta["selectedSegmentRecords"])
	}
	if meta["stopTime"] != "00:00:05.88" {
		t.Fatalf("stopTime mismatch: got %v want 00:00:05.88", meta["stopTime"])
	}
}

func TestParseUploadedTimes_DropsStartAndStopMarkers(t *testing.T) {
	svc := NewStopwatchService(nil)

	raw := buildTestCapture(
		0x92,
		[][]rawRecord{
			{
				{setID: 0, centiseconds: 0},   // T000 start marker
				{setID: 0, centiseconds: 215}, // lap
				{setID: 0, centiseconds: 313}, // lap
				{setID: 0, centiseconds: 596}, // stop marker
			},
		},
		1,   // selected segment
		4,   // selected segment record count includes start+stop
		596, // stop time (00:00:05.96)
	)

	got, meta := svc.parseUploadedTimes(raw)

	if len(got) != 2 {
		t.Fatalf("expected 2 parsed lap records, got %d", len(got))
	}

	want := []string{"00:00:02.15", "00:00:03.13"}
	for i := range want {
		if got[i].Time != want[i] {
			t.Fatalf("record %d time mismatch: got %s want %s", i+1, got[i].Time, want[i])
		}
	}

	if meta["stopTime"] != "00:00:05.96" {
		t.Fatalf("stopTime mismatch: got %v want 00:00:05.96", meta["stopTime"])
	}
}

func buildTestCapture(protoByte byte, segments [][]rawRecord, selectedSegment int, selectedCount int, stopCentiseconds int) []byte {
	raw := []byte{}

	for i, seg := range segments {
		// Marker: ff 20 11 01 20 ?? ?? ??
		raw = append(raw, 0xff, 0x20, 0x11, 0x01, 0x20, protoByte, 0x20+byte(i), 0x30+byte(i))
		for _, rec := range seg {
			raw = append(raw,
				byte(rec.setID>>8), byte(rec.setID&0xff),
				byte(rec.centiseconds>>8), byte(rec.centiseconds&0xff),
			)
		}
	}

	// Padding run delimiter.
	for i := 0; i < 80; i++ {
		raw = append(raw, 0x55)
	}

	segmentCount := len(segments)
	footer := []byte{
		byte(segmentCount >> 8), byte(segmentCount & 0xff),
		0x00, 0x00, // unknown session field
		byte(selectedSegment >> 8), byte(selectedSegment & 0xff),
		byte(selectedCount >> 8), byte(selectedCount & 0xff),
		0x00, // prefix for stop field
		byte(stopCentiseconds >> 8), byte(stopCentiseconds & 0xff),
		0x00,                   // suffix for stop field
		0x00, 0x00, 0x00, 0x09, // filler to mimic real footer shape
	}
	raw = append(raw, footer...)

	return raw
}
