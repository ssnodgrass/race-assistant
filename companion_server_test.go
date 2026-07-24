package main

import (
	"crypto/x509"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ssnodgrass/race-assistant/models"
	"github.com/ssnodgrass/race-assistant/services"
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

func TestCompanionFallbackURLsExcludeLoopback(t *testing.T) {
	httpsURL, bootstrapURL := companionFallbackURLs("192.168.50.10")
	if httpsURL != "https://192.168.50.10:8443" || bootstrapURL != "http://192.168.50.10:8080/companion-setup" {
		t.Fatalf("unexpected fallback URLs: %q %q", httpsURL, bootstrapURL)
	}
	httpsURL, bootstrapURL = companionFallbackURLs("127.0.0.1")
	if httpsURL != "" || bootstrapURL != "" {
		t.Fatalf("loopback must not be advertised to phones: %q %q", httpsURL, bootstrapURL)
	}
}

func TestUpdateCompanionNetworkSetupPreservesOtherStatus(t *testing.T) {
	service := services.NewCompanionService()
	service.ConfigureServer(models.CompanionSetup{
		HTTPSURL:       "https://race-assistant.local:8443",
		DiscoveryError: "multicast unavailable",
		CAFingerprint:  "fingerprint",
	})

	updateCompanionNetworkSetup(service, "10.42.0.15")
	setup := service.GetSetup()
	if setup.LANIP != "10.42.0.15" ||
		setup.FallbackHTTPSURL != "https://10.42.0.15:8443" ||
		setup.FallbackBootstrapURL != "http://10.42.0.15:8080/companion-setup" {
		t.Fatalf("network setup was not refreshed: %+v", setup)
	}
	if setup.DiscoveryError != "multicast unavailable" || setup.CAFingerprint != "fingerprint" {
		t.Fatalf("network refresh overwrote unrelated setup status: %+v", setup)
	}
}

func TestCompanionCertificateStoreRotatesIPFallback(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	firstPKI, err := ensureCompanionPKI(companionStableHostname, "192.168.50.10")
	if err != nil {
		t.Fatal(err)
	}
	store, err := newCompanionCertificateStore(firstPKI)
	if err != nil {
		t.Fatal(err)
	}

	secondPKI, err := ensureCompanionPKI(companionStableHostname, "10.42.0.15")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.replace(secondPKI); err != nil {
		t.Fatal(err)
	}
	certificate, err := store.getCertificate(nil)
	if err != nil {
		t.Fatal(err)
	}
	leaf, err := x509.ParseCertificate(certificate.Certificate[0])
	if err != nil {
		t.Fatal(err)
	}
	if len(leaf.IPAddresses) != 1 || leaf.IPAddresses[0].String() != "10.42.0.15" {
		t.Fatalf("rotated certificate has the wrong fallback address: %+v", leaf.IPAddresses)
	}
}

func TestCompanionBootstrapUsesCurrentFallback(t *testing.T) {
	service := services.NewCompanionService()
	service.ConfigureServer(models.CompanionSetup{HTTPSURL: "https://race-assistant.local:8443"})
	updateCompanionNetworkSetup(service, "192.168.50.10")
	mux := http.NewServeMux()
	companionPKI{caFingerprint: "fingerprint"}.registerBootstrap(mux, service)

	requestSetup := func() string {
		t.Helper()
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/companion-setup", nil))
		if recorder.Code != http.StatusOK {
			t.Fatalf("unexpected bootstrap response: %d", recorder.Code)
		}
		return recorder.Body.String()
	}

	first := requestSetup()
	if !strings.Contains(first, "https://192.168.50.10:8443/companion/") {
		t.Fatalf("bootstrap omitted the initial fallback: %s", first)
	}
	updateCompanionNetworkSetup(service, "10.42.0.15")
	second := requestSetup()
	if strings.Contains(second, "192.168.50.10") || !strings.Contains(second, "https://10.42.0.15:8443/companion/") {
		t.Fatalf("bootstrap did not refresh the fallback: %s", second)
	}
}
