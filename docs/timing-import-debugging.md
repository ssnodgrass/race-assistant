# Timing Import Debugging

This repo now includes a standalone serial capture tool for stopwatch upload debugging:

```bash
go run ./cmd/serialtap -port COM4 -baud 4800
```

What it does:
- opens the serial port
- asserts `DTR` and `RTS`
- sends the stopwatch upload command `14 14`
- captures the raw byte stream until the upload footer is detected or the port goes idle
- writes three files under `artifacts/serialtap-YYYYMMDD-HHMMSS/`

Artifacts:
- `raw.bin`: exact bytes received from the stopwatch
- `summary.json`: parser metadata, footer fields, selected segment, lap counts
- `segments.txt`: human-readable parsed segment times

Useful flags:

```bash
go run ./cmd/serialtap \
  -port COM4 \
  -baud 4800 \
  -data-bits 8 \
  -stop-bits 1 \
  -parity none \
  -idle-timeout 3s \
  -out ./artifacts/my-watch-dump
```

Fallback import path:
- In the Stopwatch Import screen, use `Load Watchware Export`.
- Select the `NkDataExport.txt` file exported by Watchware.
- The parser groups rows by Watchware `Segment`, rotates wrapped `Mem` slots so `T000` becomes the logical start, drops the start marker, and stages the rest of the cumulative times for normal import into event timing.

Notes on the included sample:
- `NkDataExport20260515.txt` is wrapped at `T079 -> T000`.
- The fallback parser reconstructs that as chronological `T000, T001, ..., T079`.
- `T000` is treated as the start marker and not imported as a finisher time.
