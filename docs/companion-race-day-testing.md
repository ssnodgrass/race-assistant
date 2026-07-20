# Phone Companion Race-Day Test

The companion is designed for one common finish chute shared by events with a single race start. The laptop remains the database of record. Use a laptop hotspot or travel router so its IP address remains stable from setup through the end of the race.

## One-time phone trust setup

1. Open a race database and select a race.
2. Open **Phone Companion** and scan **Trust this laptop**.
3. Verify the certificate fingerprint on the phone matches the laptop.
4. On iPhone, install the downloaded profile, then open **Settings → General → About → Certificate Trust Settings** and enable full trust for Race Assistant.
5. On Android, install the downloaded CA certificate through the device security/credential settings.
6. Open the companion page and add it to the phone home screen. Launch the installed app.
7. Return to Phone Companion on the laptop, select the recording scope, start the session, and generate a pairing QR and numeric code.
8. In the installed app, choose **Scan Pairing QR with Camera**, allow camera access, and scan the laptop screen. Alternatively, enter the eight-digit code.
9. Repeat pairing with a fresh QR or code for every additional phone or browser.

Only the public CA certificate is downloaded. The CA private key remains in the laptop's Race Assistant configuration directory. Resetting that CA requires repeating phone trust setup.

The in-app camera uses the same secure browser camera API on iOS and Android, but permission screens and camera selection are controlled by each operating system. If camera access is denied or unavailable, use the numeric code. A pairing QR opened in Firefox, Safari, or the system Camera app does not pair an already-installed PWA because each app has its own browser storage.

## Pairing-method test

1. Install the unpaired companion on the phone home screen and launch it.
2. Generate a pairing grant on the laptop and confirm an eight-digit numeric code appears below the QR.
3. Tap **Scan Pairing QR with Camera**, grant permission, and confirm the rear camera loads the credential without leaving the PWA. Tap **Pair This Device** to finish.
4. Generate another pairing grant for a second browser, type its numeric code, and confirm it pairs.
5. Confirm reusing the QR after its code was used—or reusing the code after its QR was used—is rejected.
6. Enter incorrect codes repeatedly and confirm the server temporarily rate-limits pairing after ten attempts.

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
4. Use **No Bib / Numbered Stick**. Confirm a numbered `PH:` entry is created for a real runner who needs follow-up.
5. Record another finish time, then use **Extra Finish / Exclude from Results**. Confirm an **Excluded Finish** occupies the matching placement, the time and bib counts remain aligned, and no participant result or award is created for it.
6. Enter an unregistered bib. Confirm it advances with an amber warning and can reconcile after that participant is added.
7. Use **Undo last** and confirm only the tail entry is removed and its place is reused.
8. Attempt to acquire Timer from another phone. Confirm it is rejected until the laptop explicitly releases or transfers the lease.
9. Revoke a phone from the desktop and confirm further writes are rejected while its unsent queue remains visible.
10. Restart the laptop app, reopen the same database, and confirm paired devices and active leases reconnect on the same network address.

## Result search test

1. Open **Live Results**, enter part of a runner's first or last name, and confirm all matching finishers appear rather than only the latest ten.
2. Search by bib number and confirm the same runner appears.
3. Open **Full Standings** and repeat both searches.
4. Confirm numbered placeholders and excluded finishes do not appear as participant search results.

## Automated checks

Run from the repository root:

```bash
go test ./...
cd frontend
npm test
npm run build:dev
```

The Go tests cover mixed-event reconciliation, offline start derivation, idempotency, role exclusivity, duplicate markers, numbered placeholders, excluded finishes, undo, and duplicate-bib enforcement. Frontend tests cover clock sample selection, drift correction, and elapsed-time formatting.
