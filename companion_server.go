package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ssnodgrass/race-assistant/models"
	"github.com/ssnodgrass/race-assistant/services"
)

type companionPKI struct {
	caDER         []byte
	caFingerprint string
	certFile      string
	keyFile       string
	host          string
}

func preferredLANIP() string {
	interfaces, _ := net.Interfaces()
	bestIP := ""
	bestScore := -1
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		name := strings.ToLower(iface.Name)
		if strings.HasPrefix(name, "docker") || strings.HasPrefix(name, "br-") ||
			strings.HasPrefix(name, "veth") || strings.HasPrefix(name, "virbr") ||
			strings.HasPrefix(name, "podman") || strings.HasPrefix(name, "tun") ||
			strings.HasPrefix(name, "tap") {
			continue
		}
		addrs, _ := iface.Addrs()
		for _, addr := range addrs {
			ip, _, err := net.ParseCIDR(addr.String())
			ip4 := ip.To4()
			if err == nil && ip4 != nil && ip.IsPrivate() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() {
				score := 0
				if strings.HasPrefix(name, "wl") || strings.Contains(name, "wifi") {
					score += 100
				} else if strings.HasPrefix(name, "en") || strings.HasPrefix(name, "eth") {
					score += 80
				}
				switch {
				case ip4[0] == 192 && ip4[1] == 168:
					score += 30
				case ip4[0] == 10:
					score += 20
				case ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31:
					score += 10
				}
				if score > bestScore {
					bestScore = score
					bestIP = ip4.String()
				}
			}
		}
	}
	if bestIP != "" {
		return bestIP
	}
	return "127.0.0.1"
}

func ensureCompanionPKI(host string) (companionPKI, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return companionPKI{}, err
	}
	dir := filepath.Join(configDir, "race-assistant", "companion-pki")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return companionPKI{}, err
	}
	caCertPath := filepath.Join(dir, "ca.crt")
	caKeyPath := filepath.Join(dir, "ca.key")
	caDER, readErr := os.ReadFile(caCertPath)
	caKeyPEM, keyErr := os.ReadFile(caKeyPath)
	var caCert *x509.Certificate
	var caKey *rsa.PrivateKey
	if readErr == nil && keyErr == nil {
		if block, _ := pem.Decode(caDER); block != nil {
			caDER = block.Bytes
		}
		caCert, readErr = x509.ParseCertificate(caDER)
		block, _ := pem.Decode(caKeyPEM)
		if block == nil {
			keyErr = fmt.Errorf("invalid companion CA key")
		} else {
			caKey, keyErr = x509.ParsePKCS1PrivateKey(block.Bytes)
		}
	}
	if readErr != nil || keyErr != nil || caCert == nil || caKey == nil {
		caKey, err = rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			return companionPKI{}, err
		}
		now := time.Now()
		tmpl := &x509.Certificate{SerialNumber: big.NewInt(now.UnixNano()), Subject: pkix.Name{CommonName: "Race Assistant Local CA", Organization: []string{"Race Assistant"}}, NotBefore: now.Add(-time.Hour), NotAfter: now.AddDate(10, 0, 0), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature}
		caDER, err = x509.CreateCertificate(rand.Reader, tmpl, tmpl, &caKey.PublicKey, caKey)
		if err != nil {
			return companionPKI{}, err
		}
		certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER})
		keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(caKey)})
		if err = os.WriteFile(caCertPath, certPEM, 0644); err != nil {
			return companionPKI{}, err
		}
		if err = os.WriteFile(caKeyPath, keyPEM, 0600); err != nil {
			return companionPKI{}, err
		}
		caCert, _ = x509.ParseCertificate(caDER)
	}
	now := time.Now()
	leafKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return companionPKI{}, err
	}
	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	leaf := &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: "Race Assistant Companion"}, NotBefore: now.Add(-time.Hour), NotAfter: now.Add(30 * 24 * time.Hour), KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, IPAddresses: []net.IP{net.ParseIP(host)}}
	leafDER, err := x509.CreateCertificate(rand.Reader, leaf, caCert, &leafKey.PublicKey, caKey)
	if err != nil {
		return companionPKI{}, err
	}
	certFile := filepath.Join(dir, "server.crt")
	keyFile := filepath.Join(dir, "server.key")
	chain := append(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: leafDER}), pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER})...)
	if err = os.WriteFile(certFile, chain, 0644); err != nil {
		return companionPKI{}, err
	}
	if err = os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(leafKey)}), 0600); err != nil {
		return companionPKI{}, err
	}
	sum := sha256Bytes(caDER)
	return companionPKI{caDER: caDER, caFingerprint: strings.ToUpper(strings.Join(splitEvery(hexString(sum), 2), ":")), certFile: certFile, keyFile: keyFile, host: host}, nil
}

func sha256Bytes(data []byte) []byte { h := sha256Sum(data); return h[:] }
func sha256Sum(data []byte) [32]byte { return sha256.Sum256(data) }
func hexString(data []byte) string {
	const digits = "0123456789abcdef"
	out := make([]byte, len(data)*2)
	for i, b := range data {
		out[i*2] = digits[b>>4]
		out[i*2+1] = digits[b&15]
	}
	return string(out)
}
func splitEvery(v string, n int) []string {
	var out []string
	for len(v) > 0 {
		if len(v) < n {
			n = len(v)
		}
		out = append(out, v[:n])
		v = v[n:]
	}
	return out
}

func (p companionPKI) registerBootstrap(mux *http.ServeMux) {
	mux.HandleFunc("/companion-setup", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!doctype html><meta name="viewport" content="width=device-width"><title>Trust Race Assistant</title><style>body{font:18px system-ui;max-width:680px;margin:40px auto;padding:20px}a{display:block;padding:18px;background:#076fe5;color:white;margin:18px 0;text-align:center;border-radius:8px}code{word-break:break-all}</style><h1>Trust this Race Assistant laptop</h1><p>Verify this fingerprint on the laptop:</p><code>%s</code><a href="/companion-ca.crt">Android / certificate download</a><a href="/race-assistant.mobileconfig">iPhone / iPad profile</a><p><strong>iPhone/iPad:</strong> installing the profile is only the first step. You must also open Settings → General → About → Certificate Trust Settings and enable full trust for Race Assistant Local CA.</p><a href="https://%s:8443/companion/">Test HTTPS trust and open Companion</a><p>This laptop intentionally reuses the same local CA. Downloading it again will not change the fingerprint; if the trust test fails, remove an older Race Assistant profile, reinstall this one, and enable full trust again.</p>`, p.caFingerprint, p.host)
	})
	mux.HandleFunc("/companion-ca.crt", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/x-x509-ca-cert")
		w.Header().Set("Content-Disposition", `attachment; filename="race-assistant-ca.crt"`)
		_, _ = w.Write(p.caDER)
	})
	mux.HandleFunc("/race-assistant.mobileconfig", func(w http.ResponseWriter, r *http.Request) {
		payload := base64.StdEncoding.EncodeToString(p.caDER)
		profile := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>PayloadContent</key><array><dict><key>PayloadCertificateFileName</key><string>race-assistant-ca.cer</string><key>PayloadContent</key><data>%s</data><key>PayloadDescription</key><string>Trust the local Race Assistant timing laptop.</string><key>PayloadDisplayName</key><string>Race Assistant Local CA</string><key>PayloadIdentifier</key><string>com.ssnodgrass.raceassistant.ca</string><key>PayloadType</key><string>com.apple.security.root</string><key>PayloadUUID</key><string>4D74C168-4C62-47FA-8C72-0A7537580871</string><key>PayloadVersion</key><integer>1</integer></dict></array><key>PayloadDisplayName</key><string>Race Assistant Trust</string><key>PayloadIdentifier</key><string>com.ssnodgrass.raceassistant.profile</string><key>PayloadOrganization</key><string>Race Assistant</string><key>PayloadType</key><string>Configuration</string><key>PayloadUUID</key><string>A443AFB4-703B-4EC5-B8CD-FA469D129C51</string><key>PayloadVersion</key><integer>1</integer></dict></plist>`, payload)
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/x-apple-aspen-config")
		w.Header().Set("Content-Disposition", `attachment; filename="race-assistant.mobileconfig"`)
		_, _ = io.WriteString(w, profile)
	})
}

func startCompanionHTTPS(frontendFS fs.FS, service *services.CompanionService, pki companionPKI) {
	mux := http.NewServeMux()
	files := http.FileServer(http.FS(frontendFS))
	mux.HandleFunc("/companion/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/companion/" {
			files.ServeHTTP(w, r)
			return
		}
		f, err := frontendFS.Open("index.html")
		if err != nil {
			http.Error(w, "companion unavailable", 500)
			return
		}
		defer f.Close()
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.Copy(w, f)
	})
	mux.Handle("/assets/", files)
	mux.Handle("/companion.webmanifest", files)
	mux.Handle("/companion-sw.js", files)
	mux.HandleFunc("/api/companion/pair", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method not allowed", 405)
			return
		}
		var req struct {
			Token string `json:"token"`
			Name  string `json:"name"`
		}
		if json.NewDecoder(r.Body).Decode(&req) != nil {
			http.Error(w, "invalid request", 400)
			return
		}
		token, state, err := service.Pair(req.Token, req.Name)
		if err != nil {
			writeCompanionError(w, err, http.StatusUnauthorized)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "race_companion", Value: token, Path: "/", Secure: true, HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: 86400})
		writeJSON(w, state)
	})
	mux.HandleFunc("/api/companion/state", func(w http.ResponseWriter, r *http.Request) {
		token := companionCookie(r)
		state, err := service.StateForToken(token)
		if err != nil {
			writeCompanionError(w, err, http.StatusUnauthorized)
			return
		}
		writeJSON(w, state)
	})
	mux.HandleFunc("/api/companion/clock", func(w http.ResponseWriter, r *http.Request) {
		if _, err := service.Authenticate(companionCookie(r)); err != nil {
			writeCompanionError(w, err, http.StatusUnauthorized)
			return
		}
		received := time.Now().UnixMilli()
		writeJSON(w, map[string]int64{"server_receive_unix_ms": received, "server_send_unix_ms": time.Now().UnixMilli()})
	})
	mux.HandleFunc("/api/companion/events", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		state, err := service.StateForToken(companionCookie(r))
		if err != nil {
			writeCompanionError(w, err, http.StatusUnauthorized)
			return
		}
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache, no-transform")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		if err := writeSSEEvent(w, "state", state); err != nil {
			return
		}
		flusher.Flush()
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-r.Context().Done():
				return
			case <-ticker.C:
				state, err = service.StateForToken(companionCookie(r))
				if err != nil {
					event := "unavailable"
					if errors.Is(err, services.ErrCompanionUnauthorized) {
						event = "unauthorized"
					}
					_ = writeSSEEvent(w, event, map[string]string{"error": err.Error()})
					flusher.Flush()
					return
				}
				if err := writeSSEEvent(w, "state", state); err != nil {
					return
				}
				flusher.Flush()
			}
		}
	})
	mux.HandleFunc("/api/companion/role/", func(w http.ResponseWriter, r *http.Request) {
		role := strings.TrimPrefix(r.URL.Path, "/api/companion/role/")
		var err error
		if r.Method == "PUT" {
			err = service.AcquireRole(companionCookie(r), role)
		} else if r.Method == "DELETE" {
			err = service.ReleaseRole(companionCookie(r), role)
		} else {
			http.Error(w, "method not allowed", 405)
			return
		}
		if err != nil {
			writeCompanionError(w, err, http.StatusConflict)
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/companion/entries", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method not allowed", 405)
			return
		}
		var req struct {
			Entries []models.CompanionEntry `json:"entries"`
		}
		if json.NewDecoder(r.Body).Decode(&req) != nil {
			http.Error(w, "invalid request", 400)
			return
		}
		acks, err := service.Submit(companionCookie(r), req.Entries)
		if err != nil {
			writeCompanionError(w, err, http.StatusConflict)
			return
		}
		writeJSON(w, map[string]interface{}{"acks": acks})
	})
	mux.HandleFunc("/api/companion/undo/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method not allowed", 405)
			return
		}
		id := strings.TrimPrefix(r.URL.Path, "/api/companion/undo/")
		if err := service.Undo(companionCookie(r), id); err != nil {
			writeCompanionError(w, err, http.StatusConflict)
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.Handle("/", files)
	server := &http.Server{Addr: ":8443", Handler: securityHeaders(mux), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		log.Printf("Companion HTTPS server started on https://%s:8443", pki.host)
		if err := server.ListenAndServeTLS(pki.certFile, pki.keyFile); err != nil && err != http.ErrServerClosed {
			log.Printf("Companion HTTPS server error: %v", err)
			setup := service.GetSetup()
			setup.ServerError = err.Error()
			service.ConfigureServer(setup)
		}
	}()
}

func companionCookie(r *http.Request) string {
	c, err := r.Cookie("race_companion")
	if err != nil {
		return ""
	}
	return c.Value
}
func writeCompanionError(w http.ResponseWriter, err error, fallbackStatus int) {
	status := fallbackStatus
	if errors.Is(err, services.ErrCompanionUnavailable) {
		status = http.StatusServiceUnavailable
	} else if errors.Is(err, services.ErrCompanionUnauthorized) {
		status = http.StatusUnauthorized
	}
	http.Error(w, err.Error(), status)
}
func writeSSEEvent(w io.Writer, event string, value interface{}) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
	return err
}
func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}
