# WatchWare Stopwatch Upload Format (COM Log)

This document describes the stopwatch upload format seen in `dump_view.txt` / `terminal_raw_view.txt` captures.

Scope:
- Nelson/Interval stopwatch uploads via WatchWare
- Serial monitor logs that show hex + ASCII columns
- Parsing only the uploaded lap data used by Race Assistant

## 1) Transfer Overview

Observed transfer flow:
1. Port opens (`COM4` in sample capture).
2. WatchWare writes command bytes: `14 14`.
3. Watch replies with a long binary payload.
4. Payload includes:
   - Record data (segment + time records)
   - Control/status records interleaved
   - `0x55` padding block
   - Footer metadata block
5. Port closes.

## 2) Log File Notes

`dump_view.txt` is UTF-16 text output from the serial monitor.
- Use the left hex bytes from `Read data (COM4)` lines.
- Ignore the right ASCII visualization column.
- Do not parse this file as a raw binary dump directly.

## 3) Frame Layout (Observed)

Using latest validated capture:

- Initial reply header (single-segment sample): `ff 20 11 01 20 92 02 45`
- Then repeating 4-byte records
- Then long `55 55 55 ...` padding
- Then footer metadata:

`00 01 00 1b 00 01 00 19 00 31 34 00 00 6c 00 09 ff 20 11 01 20 92 02 45 ff 20 11 01 20 92 06 19 0a 56 4f 00`

## 4) Record Format

Each lap/timeline record is 4 bytes, big-endian words:

- Bytes `[0..1]`: set id (not always the uploaded segment index)
- Bytes `[2..3]`: centiseconds

Formula:
- `segment = (b0 << 8) | b1`
- `centiseconds = (b2 << 8) | b3`

Time formatting:
- `HH:MM:SS.CS` from centiseconds

Example:
- `00 00 01 30` -> segment `0`, time `0x0130 = 304 cs = 00:00:03.04`

## 5) Control Records Inside Data Stream

These records are not lap times and must be ignored:

- `ff 20 12 12` (repeated marker)
- `13 83 xx xx` (paired status-like marker)

In the sample, these appear as 5 paired inserts in the middle of the record stream.

## 6) Segment and Lap Semantics (Single-Segment Upload)

Observed set ids present in stream: `0, 2, 3, 4, 5, 6, 7`.

For the validated upload:
- One uploaded segment only
- Uploaded segment block contains set id `0` timeline entries
- Uploaded lap count is `25`

Important stopwatch semantics:
- `T000` = start time (`00:00:00.00`) -> ignore
- `T026` = stop time (`00:02:05.96`) -> ignore for finishers
- True lap/finisher times are the laps between start/stop markers.

## 7) Footer Metadata (Current Understanding)

From sample footer prefix:
- `00 01` -> inferred: number of uploaded segments (`1`)
- `00 1b` -> inferred: number of timeline entries in that segment (`27`) including start + stop
- `00 19` -> inferred: lap/finisher count (`25`)
- `00 31 34` -> stop time centiseconds (`0x3134 = 12596 cs = 00:02:05.96`)

Fields after that include additional status/transport words and should currently be treated as protocol metadata, not laps.

Notes:
- `0x001b = 27` and `0x0019 = 25` align with:
  - 25 finish laps
  - plus 2 non-lap markers (`T000`, `T026`)

## 8) Parsing Rules for Race Assistant

Recommended parser behavior:
1. Extract hex bytes from `Read data` rows (left hex columns only).
2. Detect segment transport markers: `ff 20 11 01 20 ?? ?? ??`.
3. Build uploaded segment blocks from marker-to-marker ranges:
   - block data starts immediately after the 8-byte marker
   - block ends at next marker (or padding for last block)
4. Parse each block as 4-byte records (`set_id`, `centiseconds`).
5. Drop control records (`ff 20 12 12`, `13 83 xx xx`) inside blocks.
6. For each uploaded segment block:
   - keep timeline entries in order
   - treat first entry as start (`T000`) and last entry as stop (`Tnnn`) when lap semantics match stopwatch behavior
   - imported finisher laps are entries excluding start/stop
7. Use footer counts as validation, not as the primary splitter.
8. Emit normalized `HH:MM:SS.CS`.

## 9) Known Good Result (Latest Validated Capture)

For the latest capture discussed:
- Uploaded segment count: `1`
- Uploaded segment: `0`
- Lap times imported: `25`
- Last valid lap: `00:02:04.31`
- Stop marker time: `00:02:05.96` (not a lap)

## 10) Multi-Segment Upload Findings

Validated with:
- `dump_view_multi_segments.txt`
- `terminal_view_multi_segments.txt`

Observed segment markers:
1. `ff 20 11 01 20 92 30 21`
2. `ff 20 11 01 20 92 39 32`
3. `ff 20 11 01 20 92 39 42`

Confirmed uploaded blocks:
- Segment 1: 11 timeline records (10 laps + stop)
- Segment 2: 6 timeline records (5 laps + stop)
- Segment 3: 5 lap records, with stop time carried in footer metadata

Segment 3 records:
1. `00:00:00.76`
2. `00:00:01.03`
3. `00:00:01.29`
4. `00:00:01.53`
5. `00:00:01.79` (last lap)

Segment 3 stop metadata:
- Footer contains `00 01 2a 00`
- `0x012a = 298 cs = 00:00:02.98` stop time

Important correction:
- Initial analysis incorrectly treated a later long run as segment 3 and over-counted records.
- Root cause: assuming all subsequent set-id records belonged to segment 3.
- Fix: use marker-to-marker boundaries (`ff 20 11 01 20 92 ...`) as the authoritative segment splitter.

## 11) Multi-Segment Footer Differences

Single-segment footer prefix:
- `00 01 00 1b 00 01 00 19 ...`

Multi-segment footer prefix:
- `00 03 00 1c 00 03 00 05 ...`

For multi-segment sample:
- `00 03` matches total uploaded segment count = 3.
- `00 03 00 05` matches segment-3 timeline count = 5 records.
- `00 01 2a 00` decodes to segment-3 stop time `00:00:02.98`.
- `00 1c` (28) does not match segment-3 timeline length.

Current best interpretation of `0x001c` (28):
- It is likely a global/session statistic for the uploaded transaction, not segment-3 lap count.
- Most likely candidates:
  - aggregate timeline count in the watch's active export buffer
  - count of records in an internal "selected set" context used by WatchWare, independent of segment-3 length
  - memory cursor/index value that is not a per-segment lap count
- This field should be preserved as metadata but not used to split segment records.

## 12) Deterministic Parser Rule-Set (Byte Stream)

Use this parser for the actual serial byte stream from the watch (not text logs).

1. Capture bytes directly from serial until:
   - user stops capture, or
   - upload naturally ends.
2. Find first long run of `0x55` bytes (>= 64) to detect payload end.
3. Find segment transport markers before padding:
   - `ff 20 11 01 20 ?? ?? ??` (8-byte marker)
   - `??` can vary by watch/protocol session (`0x92`, `0x81`, etc.)
4. Build segment blocks:
   - block start = `marker_offset + 8`
   - block end = next marker offset, or padding start for last block
   - block length must be divisible by 4
5. Parse each block as 4-byte records:
   - set id = first 2 bytes (big-endian)
   - centiseconds = last 2 bytes (big-endian)
6. Remove control records:
   - `set_id` in `{0xff20, 0x7f20, 0x1383, 0x1303, 0x1392}`
7. Parse footer after padding:
   - bytes `[0..1]` -> segment count
   - bytes `[4..5]` -> selected segment index
   - bytes `[6..7]` -> selected segment timeline count
   - bytes `[9..10]` -> stop time centiseconds (from `00 XX XX 00` pattern)
8. Select uploaded segment for import using footer selected segment index.
9. In selected segment block, keep only timeline records with `set_id == 0`.
10. Trim selected segment timeline to footer selected-segment count.
11. Convert centiseconds to `HH:MM:SS.CS`.
12. Keep stop time as metadata; do not import stop as finisher lap.

Pseudocode:

```text
raw = read_serial_bytes()
pad = find_first_long_run(raw, 0x55, min_run=64)
markers = find_offsets(raw[0:pad], pattern=FF 20 11 01 20 ?? ?? ??)
blocks = []
for each marker i:
  start = marker[i] + 8
  end = marker[i+1] or pad
  if (end-start) % 4 == 0:
    blocks.append(raw[start:end])

footer = raw[first_non_55_after(pad):]
segment_count = be16(footer[0:2])
selected_segment = be16(footer[4:6])
selected_count = be16(footer[6:8])
stop_cs = (footer[9] << 8) | footer[10]

records = parse_4byte_records(blocks[selected_segment-1])
records = drop_control(records)
timeline = [r.cs for r in records if r.set_id == 0]
timeline = timeline[:selected_count]
laps = format_cs(timeline)
stop_time = format_cs(stop_cs)
```

## 13) Random Multi-Segment Validation

Validated with:
- `dump_view_random.txt`
- `terminal_view_random.txt`

Observed transport markers:
1. `ff 20 11 01 20 81 24 26`
2. `ff 20 11 01 20 81 24 41`
3. `ff 20 11 01 20 81 25 01`
4. `ff 20 11 01 20 81 25 15`
5. `ff 20 11 01 20 81 25 25`

Footer:
- `00 05 00 53 00 05 00 08 00 02 4c 00 ...`
- Interpreted as:
  - segment count = `5`
  - selected segment = `5`
  - selected segment timeline count = `8`
  - selected segment stop time = `0x024c = 00:00:05.88`

This confirms:
- marker-based splitting works across `0x92` and `0x81` protocol variants
- footer selected-segment count should trim the final block
- final block may include historical watch memory after the selected segment timeline
- `0x0053` still appears to be global/session metadata, not selected segment lap count

## 14) Open Items / Future Validation

Still worth validating with additional captures:
- Exact meaning of every footer word after lap/stop fields, especially `0x001c`
- Multi-segment uploads with different segment lengths to correlate `0x001c`
- Whether segment ids are always zero-based and stable across device resets
