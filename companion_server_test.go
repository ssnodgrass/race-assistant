package main

import (
	"math/big"
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

func TestCompanionLeafCertificateIncludesStableHostnameAndIPFallback(t *testing.T) {
	leaf := companionLeafCertificate("race-assistant.local", "192.168.50.10", time.Now(), big.NewInt(1))
	if len(leaf.DNSNames) != 1 || leaf.DNSNames[0] != "race-assistant.local" {
		t.Fatalf("stable hostname missing from certificate: %+v", leaf.DNSNames)
	}
	if len(leaf.IPAddresses) != 1 || leaf.IPAddresses[0].String() != "192.168.50.10" {
		t.Fatalf("IP fallback missing from certificate: %+v", leaf.IPAddresses)
	}
}
