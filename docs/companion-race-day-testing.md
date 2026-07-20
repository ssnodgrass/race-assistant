# Phone Companion Race-Day Test

The companion is designed for one common finish chute shared by events with a single race start. The laptop remains the database of record. Use a laptop hotspot or travel router so its IP address remains stable from setup through the end of the race.

## One-time phone trust setup

1. Open a race database and select a race.
2. Open **Phone Companion** and scan **Trust this laptop**.
3. Verify the certificate fingerprint on the phone matches the laptop.
4. On iPhone, install the downloaded profile, then open **Settings → General → About → Certificate Trust Settings** and enable full trust for Race Assistant.
5. On Android, install the downloaded CA certificate through the device security/credential settings.
6. Return to Phone Companion, select the recording scope, start the session, generate a one-time pairing QR, and scan it.
7. Add the companion to the phone home screen. Repeat pairing with a fresh QR for every additional phone.

Only the public CA certificate is downloaded. The CA private key remains in the laptop's Race Assistant configuration directory. Resetting that CA requires repeating phone trust setup.

## Test fixture

Create a race with one race-wide start and these participants:

| Bib | Event |
| --- | --- |
| 101 | 5K |
| 102 | 5K |
| 201 | 10K |
| 202 | 10K |

The companion manager will refuse to start a common-chute session if the race contains duplicate non-empty bibs.

## Offline start test

1. Pair a Start phone while it is connected to the laptop network.
2. Open the Start tab and acquire the Start role.
3. Wait for green calibration with uncertainty of 50 ms or less.
4. Disconnect from the laptop network and walk away for approximately five minutes.
5. Hold **Arm Start** for two seconds and tap **Start Race** at the simulated gun.
6. Return to the laptop network without closing the installed PWA.
7. Confirm the queued start uploads automatically, the desktop manager shows an official start, and the Start lease releases.

If calibration is more than 30 minutes old or exceeds 100 ms uncertainty, the PWA must not silently submit an official start.

## Two-person chute test

1. Select **Common Chute — All Events** before starting the session. Pair two phones. On the first, acquire **Finish Timer**. On the second, acquire **Bib Chute**.
2. Tap four finish times on the Timer phone.
3. Enter bibs in this global order on the Bib phone: `101`, `201`, `102`, `202`.
4. Confirm both counts are four and their difference is zero.
5. In 5K results, confirm bibs 101 and 102 receive global finish times 1 and 3 but event places 1 and 2.
6. In 10K results, confirm bibs 201 and 202 receive global finish times 2 and 4 but event places 1 and 2.
7. Open **Placements** and **Manual Times**, select **Common Chute — All Events**, and confirm the raw streams are editable.

## Event-scoped test

1. Stop the common-chute session, select a single event, and start a new session.
2. Pair the phones with fresh QR codes and record one time and one bib.
3. Confirm the selected event name appears on the laptop and both phones.
4. Open **Placements** and **Manual Times**, select that event, and confirm both entries were written there rather than to Common Chute.

## Safeguard test

1. Turn Wi-Fi off on each phone, make two additional entries, and verify the header turns amber and pending count rises.
2. Restore Wi-Fi and verify entries replay in order, pending returns to zero, and no duplicates appear.
3. Enter bib 101 again. Confirm it advances the chute and is stored as a red duplicate marker.
4. Use **No Bib / Placeholder**. Confirm a numbered `PH:` entry is created for the matching finish stick.
5. Enter an unregistered bib. Confirm it advances with an amber warning and can reconcile after that participant is added.
6. Use **Undo last** and confirm only the tail entry is removed and its place is reused.
7. Attempt to acquire Timer from another phone. Confirm it is rejected until the laptop explicitly releases or transfers the lease.
8. Revoke a phone from the desktop and confirm further writes are rejected while its unsent queue remains visible.
9. Restart the laptop app, reopen the same database, and confirm paired devices and active leases reconnect on the same network address.

## Automated checks

Run from the repository root:

```bash
go test ./...
cd frontend
npm test
npm run build:dev
```

The Go tests cover mixed-event reconciliation, offline start derivation, idempotency, role exclusivity, duplicate markers, placeholders, undo, and duplicate-bib enforcement. Frontend tests cover clock sample selection, drift correction, and elapsed-time formatting.
