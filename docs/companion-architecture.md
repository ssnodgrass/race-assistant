# Phone Companion Architecture

The Phone Companion is a local-only PWA served by the Race Assistant laptop. It does not use cloud synchronization or voice recognition. The SQLite race database remains the system of record.

## Data flow

1. The desktop creates a 24-hour companion session for a race and a selected recording scope: one event or event `0` for the existing common chute across all events.
2. A phone installs the laptop's local CA once, then pairs inside the installed PWA or browser by scanning a single-use QR with its camera or entering the associated eight-digit code. Both credentials expire after five minutes, and using either invalidates both.
3. The server stores only a SHA-256 hash of the phone's random bearer token. The browser receives the token in a Secure, HttpOnly, SameSite cookie.
4. A paired phone acquires one exclusive role: official start, finish timer, or bib chute.
5. Every tap is captured against a calibrated laptop clock and first written to the phone's IndexedDB outbox.
6. The outbox replays in capture order. A stable `request_id` makes retries idempotent, and a `session_id` prevents entries from an old race replaying into a new one.
7. Finish captures append to `timing_pulses`; bib captures append independently to `chute_assignments`. In common-chute mode their shared global place reconciles them on the results page, where the participant's event determines event place. In event mode both streams are written directly to the selected event.

The phone keeps an authenticated Server-Sent Events stream open to the laptop for state and liveness. The server emits state once per second; if a paired phone receives nothing for 3.5 seconds it reports **Disconnected**, even when the operating system still considers cellular data online. The unpaired screen uses a slower API health check and a longer timeout so expected authorization responses do not make its connection warning flash. Commands continue to use the idempotent HTTP API, so a WebSocket protocol is unnecessary.

## Pre-race check-in

The desktop can turn a normal companion pairing grant into a separate `/checkin/` QR. It uses the same one-time pairing, device authorization, HTTPS certificate, and active companion session, but opens an installable participant lookup interface instead of adding another tab to the race-operations UI.

The check-in station caches the race roster locally, searches by name or bib, and can update a participant's name, event, age, gender, shirt size, bib, and checked-in status. Each change is first committed to an IndexedDB outbox on the device and then written to the laptop's SQLite database in one transaction. Successful commits emit a desktop refresh event so the participant list updates immediately. Multiple iPads can pair independently and refresh their roster from the laptop. The existing race-wide unique-bib trigger rejects conflicting assignments; a rejected offline item stays queued so the operator can correct it.

This workflow requires no internet connection because the laptop remains the local system of record. It does not currently push check-in status or bib changes back to RunSignUp; the existing RunSignUp integration only imports participants and does not retain the remote registration identifiers required for safe outbound synchronization.

## Local networking and trust

- Port `8080` serves only the certificate/profile bootstrap page.
- Port `8443` serves the PWA and companion API over HTTPS.
- Race Assistant advertises `race-assistant.local` over multicast DNS and uses that stable hostname for installation and pairing. The responder probes for conflicts and sends cache-flush announcements when it starts; it restarts and announces again if the preferred private LAN address changes while the application is running.
- Race Assistant creates a persistent local CA under the user's application configuration directory and a short-lived server certificate valid for both `race-assistant.local` and the startup LAN address.
- The desktop displays the CA fingerprint for out-of-band verification.
- The desktop also displays startup-IP setup and pairing fallbacks. An app installed through the IP fallback remains bound to that IP and may require reinstallation after an address change.
- A dedicated travel router or stable laptop hotspot is recommended. Multicast DNS works only when the phone and laptop share a local link that permits multicast UDP 5353; guest isolation, some phone hotspots, VPNs, and restrictive firewalls may block it. Restart Race Assistant after changing networks if the IP fallback is needed so its certificate covers the new address.

The service worker returns the cached application shell before attempting a network refresh. A paired phone therefore opens immediately with its last-known state and local queue even when the server is unavailable. The UI identifies the installed origin, reports the disconnection, and offers an explicit retry. Connectivity is based on actual companion API responses rather than `navigator.onLine`, because a phone may report no internet while its local Wi-Fi connection to the laptop is healthy. Browser origin isolation still prevents an installation or IndexedDB queue from moving between an IP URL and the `.local` URL.

## Persistence

Migration `0003_companion.sql` adds capture metadata to timing pulses and creates:

- `companion_sessions` for race, common-chute scope, status, and expiry;
- `companion_devices` for paired device names, token hashes, revocation, and last-seen time;
- `companion_role_leases` for exclusive operator roles;
- `companion_requests` for the idempotency/audit record and tail-only undo.

The PWA caches its application shell and keeps queued entries in IndexedDB. Pairing, cached race state, calibration, and the held role are retained locally so a temporary laptop restart or Wi-Fi interruption does not erase captures. Entries belonging to an older session are isolated and require an explicit operator discard; they are never submitted to the current session.

The on-phone **Local Queue** view lists every unsent entry with its type, capture time, abbreviated session ID, and sync eligibility. Operators can delete one record, all records from older sessions, or the complete unsent queue. Deletion always requires confirmation.

The on-phone **Leave race / pair again** action revokes that device, releases its role, clears its local authorization, and returns to the camera/code pairing screen. It is blocked while the current session has unsent captures so switching races cannot strand them.

## Timing behavior

The phone takes seven NTP-style samples and uses the median offset from the three lowest-latency samples. Captures retain the phone timestamp, calibrated laptop timestamp, offset, calibration time, and estimated uncertainty. A post-outage calibration linearly corrects estimated drift before upload.

Calibration expires after 30 minutes, and the server rejects captures over 100 ms uncertainty. A remote start can be captured while disconnected and becomes the race's official start when it reaches the laptop. Finish taps captured before that upload remain pending in SQLite and receive elapsed times in one transaction when the start arrives.

## Safeguards

- Common-chute mode refuses to start when non-empty bibs are duplicated within a race.
- Only one device may hold each role, and one device may hold only one role at a time.
- Pairing links are single use and cannot outlive their session.
- Numeric pairing attempts are rate-limited per client address. The PWA accepts only pairing QR codes for its current HTTPS origin, so a QR from another laptop address cannot silently redirect it.
- Device revocation immediately rejects new writes without deleting the phone's outbox.
- Duplicate, unknown, and placeholder bibs advance the chute with visible warnings rather than silently shifting later runners.
- A numbered `PH:` placeholder represents a real runner who received a finish stick and can be reconciled later. An **Excluded Finish** uses a unique internal `GP:` marker, consumes its matching chute position, and is intentionally omitted from participant results and awards.
- Undo is limited to the submitting device's latest tail entry, so it cannot create a place gap.
- Captures that precede the official start or are implausibly in the future are rejected for clock review.

See [companion-race-day-testing.md](companion-race-day-testing.md) for the physical two-phone acceptance test.
