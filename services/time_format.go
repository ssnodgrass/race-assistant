package services

import (
	"fmt"
	"strconv"
	"strings"
)

// formatStoredElapsedHundredths rounds a stored elapsed value for operator-facing
// output. The database retains the original value and companion capture timestamp.
func formatStoredElapsedHundredths(value string) string {
	parts := strings.Split(strings.TrimSpace(value), ":")
	if len(parts) != 3 {
		return value
	}
	hours, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return value
	}
	minutes, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return value
	}
	secondParts := strings.SplitN(parts[2], ".", 2)
	seconds, err := strconv.ParseInt(secondParts[0], 10, 64)
	if err != nil || hours < 0 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59 {
		return value
	}

	fraction := ""
	if len(secondParts) == 2 {
		fraction = secondParts[1]
		if fraction == "" || len(fraction) > 9 {
			return value
		}
	}
	for _, digit := range fraction {
		if digit < '0' || digit > '9' {
			return value
		}
	}
	fraction = (fraction + "000000000")[:9]
	nanoseconds, err := strconv.ParseInt(fraction, 10, 64)
	if err != nil {
		return value
	}

	totalNanoseconds := ((hours*60+minutes)*60+seconds)*1_000_000_000 + nanoseconds
	totalHundredths := (totalNanoseconds + 5_000_000) / 10_000_000
	displayHours := totalHundredths / 360_000
	displayMinutes := totalHundredths % 360_000 / 6_000
	displaySeconds := totalHundredths % 6_000 / 100
	hundredths := totalHundredths % 100
	return fmt.Sprintf("%02d:%02d:%02d.%02d", displayHours, displayMinutes, displaySeconds, hundredths)
}
