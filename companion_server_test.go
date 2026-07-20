package main

import (
	"testing"
	"time"
)

func TestPairingAttemptLimiter(t *testing.T) {
	limiter := newPairingAttemptLimiter(2, time.Minute)
	now := time.Now()
	if !limiter.allow("phone", now) || !limiter.allow("phone", now) {
		t.Fatal("limiter rejected an allowed pairing attempt")
	}
	if limiter.allow("phone", now) {
		t.Fatal("limiter allowed too many pairing attempts")
	}
	if !limiter.allow("phone", now.Add(time.Minute)) {
		t.Fatal("limiter did not reset after its window")
	}
	limiter.clear("phone")
	if !limiter.allow("phone", now) {
		t.Fatal("limiter did not clear after successful pairing")
	}
}
