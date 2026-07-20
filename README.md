# Race Assistant

Desktop race timing software for local road races. Built with:
- Go
- Wails v3
- React + TypeScript
- SQLite

## Requirements

Install these first:
- Go
- Node.js + npm
- `wails3`

Optional but helpful:
- `task` for the Taskfile shortcuts

## First-Time Setup

Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

Generate Wails bindings:

```bash
wails3 generate bindings -clean=true -ts
```

## Run In Dev

Fastest path:

```bash
wails3 dev -config ./build/config.yml
```

If you use `task`:

```bash
task dev
```

This starts the Go app plus the Vite frontend in development mode.

## Build

Build the frontend only:

```bash
cd frontend
npm run build:dev
cd ..
```

Build the desktop app:

```bash
wails3 build DEV=true
```

If you use `task`:

```bash
task build
```

## Test

Run Go tests:

```bash
go test ./...
```

Build the frontend to catch TypeScript issues:

```bash
cd frontend
npm run build:dev
```

## Stopwatch Import

There are now two timing import paths:

1. Live serial stopwatch download from the Stopwatch Import screen
2. Fallback Watchware import using `NkDataExport.txt`

For low-level serial debugging, use:

```bash
go run ./cmd/serialtap -port COM4 -baud 4800
```

More details are in [docs/timing-import-debugging.md](docs/timing-import-debugging.md).

## Phone Companion

The Phone Companion provides an installable local HTTPS web app for race start, common-chute finish timing, and bib-order entry. Open a race, choose **Phone Companion**, follow the one-time certificate trust setup, then generate a separate pairing QR for each phone.

Use a laptop hotspot or travel router so the companion HTTPS address stays stable throughout the race. The phones queue entries during brief disconnects and replay them when they return to the laptop network.

See [docs/companion-architecture.md](docs/companion-architecture.md) for the design and safeguards, and [docs/companion-race-day-testing.md](docs/companion-race-day-testing.md) for the complete setup and two-phone acceptance procedure.

## Useful Commands

Regenerate bindings:

```bash
wails3 generate bindings -clean=true -ts
```

Run frontend only:

```bash
cd frontend
npm run dev -- --port 9245 --strictPort
```

Run server-only mode:

```bash
go build -tags server -o bin/race-assistant-server
./bin/race-assistant-server
```
