# WatchWare Stopwatch Upload Format (COM Log)

This document describes the stopwatch upload format observed in WatchWare serial captures and `serialtap` raw byte dumps.

Scope:
- Nelson/Interval stopwatch uploads via WatchWare
- Serial monitor logs that show hex + ASCII columns
- Direct raw-byte captures from Race Assistant / `serialtap`
- Parsing only the uploaded lap data used by Race Assistant

## 1) Transfer Overview

Observed transfer flow:
1. Port opens.
2. Host writes upload command bytes: `14 14`.
3. Watch replies with a long binary payload.
4. Payload includes:
   - Segment transport header(s)
   - 4-byte time records
   - Control/status records interleaved
   - Long `0x55` padding block
   - Footer metadata block
5. Port closes.

## 2) Log File Notes

`dump_view.txt` style logs are UTF-16 serial monitor output.
- Use the left hex bytes from `Read data (...)` rows.
- Ignore the right ASCII visualization column.
- Do not parse those files as raw binary directly.

For real parser validation, prefer raw byte dumps such as:
- `artifacts/.../raw.bin`

## 3) Transport Headers

Validated 8-byte transport headers:

1. Older validated variant:

`ff 20 11 01 20 92 02 45`

2. Long-run validated variant:

`ff 20 11 02 09 09 36 04`

Important:
- Both are real segment/data transport headers.
- Footer metadata may also contain `ff 20 11 ...` bytes that are **not** segment starts.
- Marker detection must therefore be limited to the region before the true `0x55` padding/footer boundary.

## 4) Record Format

Each timeline record is 4 bytes, big-endian:

- Bytes `[0..1]`: `set_id`
- Bytes `[2..3]`: low 16 bits of the cumulative centisecond count

Short-run interpretation:
- In short captures, `set_id` may stay at `0`
- Full time is then just the low word

Long-run interpretation:
- In longer captures, `set_id` acts as the high 16-bit extension of the cumulative time
- Full elapsed centiseconds are:

`full_centiseconds = (set_id << 16) | low_word`

Examples:
- `00 00 01 30` -> `304 cs = 00:00:03.04`
- `00 01 a9 92` -> `(1 << 16) + 0xa992 = 108946 cs = 00:18:09.46`

Important correction:
- `set_id` is **not** reliably the uploaded segment index.
- For long runs it is part of the time counter.

## 5) Control Records Inside the Data Stream

These records are transport/control artifacts and must be ignored:

- `ff 20 12 12`
- `13 83 xx xx`

Current filter set used by the parser:
- `0xff20`
- `0x7f20`
- `0x1383`
- `0x1303`
- `0x1392`

## 6) Single-Segment Stopwatch Semantics

Validated short-run behavior:
- The selected segment is uploaded as one ordered timeline
- `T000` is the start marker and must not be imported as a finisher
- The terminal stop marker must not be imported as a finisher unless the operator explicitly chooses to keep it

Example validated short run:
- Footer segment count: `1`
- Footer selected segment: `1`
- Footer selected-segment records: `25`
- Stop marker time: `00:02:05.96`
- Last valid lap before stop: `00:02:04.31`

## 7) Footer Metadata

Observed footer layout:

- bytes `[0..1]` -> uploaded segment count
- bytes `[4..5]` -> selected segment index
- bytes `[6..7]` -> selected segment timeline count in some captures
- bytes `[8..10]` -> stop time high/mid/low bytes
- byte `[11]` -> trailing `0x00`

Short-run footer stop example:
- `00 31 34 00`
- stop time = `0x003134 = 12596 cs = 00:02:05.96`

Long-run footer stop example:
- `07 23 3d 00`
- stop time = `0x07233d = 467773 cs = 01:17:57.73`

Formula:

`stop_centiseconds = (footer[8] << 16) | (footer[9] << 8) | footer[10]`

Important:
- Footer metadata after the stop field may contain extra transport-looking words.
- Those bytes are protocol metadata, not segment records.

## 8) Multi-Segment Findings

Validated marker-delimited multi-segment captures:
- Segment 1 stop time is present inside that segment’s records
- Intermediate segments behave the same way: terminal stop appears in the records
- The final selected segment may omit the stop record and instead carry the terminal stop only in footer metadata

Validated example:
- Segment 1: 10 laps + stop in records
- Segment 2: 5 laps + stop in records
- Segment 3: 5 laps in records, stop in footer metadata

This means stop handling must be segment-aware:
- Non-final segments: drop the last record as stop
- Final segment: use footer stop metadata and/or reset behavior to decide whether the last visible time is a stop marker

## 9) Long-Run Single-Block Findings

Validated with:
- `artifacts/my-watch-dump/raw.bin`

Observed behavior:
- One real marker-delimited block starting with `ff 20 11 02 09 09 36 04`
- Footer segment count reported `2`
- Only one active marker block appeared before padding
- The first 79 reconstructed cumulative times formed one clean increasing run
- After the 79th time, the stream reset back to a few seconds and continued through stale watch memory

Important interpretation:
- The first increasing run is the active selected run
- The value immediately before the reset is the terminal stop time for that run
- Everything after the reset is stale historical memory and must not be imported as finishers

This is a protocol rule, not a platform-specific rule.

## 10) Deterministic Parser Rules

Use this parser for the actual serial byte stream from the watch.

1. Capture bytes directly from serial until:
   - user stops capture, or
   - upload naturally ends
2. Find candidate segment markers by scanning for `ff 20 11`
3. Prefer the long `0x55` run (>= 64 bytes) that follows the real marker/data region
4. Limit marker detection to the pre-padding region only
5. Build segment blocks:
   - block start = `marker_offset + 8`
   - block end = next marker offset, or padding start for last block
   - block length must be divisible by 4
6. Parse each block as 4-byte records
7. Drop known control records
8. Reconstruct cumulative times using:
   - `full_centiseconds = (set_id << 16) | low_word`
9. Trim the timeline at the first cumulative-time reset:
   - if times rise steadily and then jump back to a much smaller value, treat everything after the reset as stale memory
10. Apply stop handling:
   - drop initial `T000`
   - for non-final segments, drop the terminal stop record
   - for the final segment, use footer stop metadata and/or reset-trim context
   - if the operator chooses to include terminal stop time, keep that final stop marker
11. Use footer selected-segment count as validation and trimming help when it is non-zero and matches observed behavior
12. Emit normalized `HH:MM:SS.CS`

## 11) Pseudocode

```text
raw = read_serial_bytes()

marker_candidates = find_offsets(raw, pattern=FF 20 11 ...)
pad = find_padding_after_real_marker_region(raw, marker_candidates)
markers = find_offsets(raw[0:pad], pattern=FF 20 11 ...)

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
stop_cs = (footer[8] << 16) | (footer[9] << 8) | footer[10]

records = parse_4byte_records(blocks[selected_segment-1])
records = drop_control(records)
timeline = [((r.set_id << 16) | r.low_word) for r in records]
timeline = trim_at_first_reset(timeline)

if selected_count > 0:
  timeline = timeline[:selected_count]

timeline = drop_start_and_stop_markers(timeline, stop_cs, segment_position, include_terminal_stop)

laps = format_cs(timeline)
stop_time = format_cs(stop_cs)
```

## 12) Practical Implications for Race Assistant

Race Assistant currently relies on these protocol rules:
- Marker-delimited blocks when multiple true transport headers exist
- 24-bit stop decoding from footer bytes `[8..10]`
- Long-run cumulative time reconstruction using `set_id` as the high word
- Trim at first cumulative-time reset to avoid importing stale watch memory
- Operator checkbox for whether the terminal stop time should be imported as a placement

## 13) Known Good Results

Short validated run:
- Uploaded segment count: `1`
- Parsed finish laps: `25`
- Last valid lap: `00:02:04.31`
- Stop marker: `00:02:05.96`

Long validated run:
- Active increasing run length: `79` timeline records
- Last valid finish before stop: `00:56:45.02`
- Terminal stop marker: `01:17:57.73`
- Historical memory begins immediately after the reset to `00:00:04.19`

## 14) Summary of Updated Findings

These older assumptions are no longer sufficient:
- `ff 20 11 01 20 ...` is not the only valid segment header
- `set_id == 0` is not a reliable way to identify real timeline records
- footer stop time is not always just a 16-bit value

Current corrected understanding:
- there are at least two validated 8-byte marker variants
- `set_id` may be the high word of cumulative time
- footer stop time is effectively a 24-bit counter
- stale memory after the active run is best detected by the first cumulative-time reset
