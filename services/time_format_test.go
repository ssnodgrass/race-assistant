package services

import "testing"

func TestFormatStoredElapsedHundredths(t *testing.T) {
	tests := map[string]string{
		"01:02:03.344": "01:02:03.34",
		"01:02:03.345": "01:02:03.35",
		"00:59:59.999": "01:00:00.00",
		"00:18:24.12":  "00:18:24.12",
		"not-a-time":   "not-a-time",
	}
	for input, expected := range tests {
		if actual := formatStoredElapsedHundredths(input); actual != expected {
			t.Errorf("formatStoredElapsedHundredths(%q) = %q, want %q", input, actual, expected)
		}
	}
}
