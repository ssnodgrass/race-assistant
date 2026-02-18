package main

import (
	"database/sql"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/ssnodgrass/race-assistant/database"
	"github.com/ssnodgrass/race-assistant/internal/repository"
	"github.com/ssnodgrass/race-assistant/services"
	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

type DatabaseService struct {
	app       *application.App
	currentDB *sql.DB
	dbPath    string
	services  []serviceWithDB
}

type serviceWithDB interface {
	SetDB(db *sql.DB)
}

func (s *DatabaseService) GetStatus() string {
	return s.dbPath
}

func (s *DatabaseService) New() {
	result, err := s.app.Dialog.OpenFile().
		SetTitle("Create New Database").
		AddFilter("Database Files (*.db)", "*.db").
		PromptForSingleSelection()

	if err != nil || result == "" {
		return
	}
	s.connectTo(result)
}

func (s *DatabaseService) Open() {
	result, err := s.app.Dialog.OpenFile().
		SetTitle("Open Database").
		AddFilter("Database Files (*.db)", "*.db").
		PromptForSingleSelection()

	if err != nil || result == "" {
		return
	}
	s.connectTo(result)
}

func (s *DatabaseService) Close() {
	if s.currentDB != nil {
		s.currentDB.Close()
		s.currentDB = nil
	}
	s.dbPath = ""
	for _, service := range s.services {
		service.SetDB(nil)
	}
	s.app.Event.Emit("db:closed", nil)
}

func (s *DatabaseService) OpenExternalWindow(view string, raceID int) {
	log.Printf("[Action] Opening External Window (%s) for Race %d\n", view, raceID)
	// We create a window with NO reference to the main menu to prevent Linux GTK crashes
	s.app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Race Assistant Display",
		URL:    fmt.Sprintf("/?view=%s&raceID=%d", view, raceID),
		Width:  1024,
		Height: 768,
	})
}

func (s *DatabaseService) connectTo(path string) {
	dsn := fmt.Sprintf("%s?_busy_timeout=5000", path)
	db, err := database.Connect(dsn)
	if err != nil {
		s.app.Dialog.Info().SetTitle("Error").SetMessage(err.Error()).Show()
		return
	}

	if s.currentDB != nil {
		s.currentDB.Close()
	}

	s.currentDB = db
	s.dbPath = path
	for _, service := range s.services {
		service.SetDB(db)
	}
	s.app.Event.Emit("db:connected", path)
}

func (s *DatabaseService) GetFilePath(title string) string {
	result, _ := s.app.Dialog.OpenFile().SetTitle(title).PromptForSingleSelection()
	return result
}

func (s *DatabaseService) GetSavePath(title string, defaultName string) string {
	result, _ := s.app.Dialog.OpenFile().SetTitle(title).PromptForSingleSelection()
	return result
}

func main() {
	raceRepo := repository.NewRaceRepository(nil)
	eventRepo := repository.NewEventRepository(nil)
	participantRepo := repository.NewParticipantRepository(nil)
	timingRepo := repository.NewTimingRepository(nil)

	raceService := services.NewRaceService(raceRepo)
	eventService := services.NewEventService(eventRepo)
	participantService := services.NewParticipantService(participantRepo)
	timingService := services.NewTimingService(timingRepo, eventRepo)
	awardService := services.NewAwardService(eventRepo, timingRepo)
	reportingService := services.NewReportingService(raceRepo, eventRepo, participantRepo, timingRepo, awardService, timingService)
	stopwatchService := services.NewStopwatchService(timingRepo)

	dbService := &DatabaseService{
		services: []serviceWithDB{
			raceService,
			eventService,
			participantService,
			timingService,
			awardService,
			reportingService,
			stopwatchService,
		},
	}

	frontendFS, _ := fs.Sub(assets, "frontend/dist")

	go func() {
		mux := http.NewServeMux()
		mux.Handle("/", http.FileServer(http.FS(frontendFS)))
		mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"dbPath": dbService.dbPath})
		})
		mux.HandleFunc("/api/races", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			list, _ := raceService.ListRaces()
			json.NewEncoder(w).Encode(list)
		})
		mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			raceID, _ := strconv.Atoi(r.URL.Query().Get("raceID"))
			list, _ := eventService.ListEvents(raceID)
			json.NewEncoder(w).Encode(list)
		})
		mux.HandleFunc("/api/awards", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			eventID, _ := strconv.Atoi(r.URL.Query().Get("eventID"))
			list, _ := awardService.GetAwards(eventID)
			json.NewEncoder(w).Encode(list)
		})
		mux.HandleFunc("/api/results", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			eventID, _ := strconv.Atoi(r.URL.Query().Get("eventID"))
			list, _ := timingService.GetEventResults(eventID)
			json.NewEncoder(w).Encode(list)
		})
		log.Println("Web Hub Server started on :8080")
		http.ListenAndServe(":8080", mux)
	}()

	app := application.New(application.Options{
		Name:        "Race Assistant",
		Description: "Road Race Registration and Timing System",
		Services: []application.Service{
			application.NewService(raceService),
			application.NewService(eventService),
			application.NewService(participantService),
			application.NewService(timingService),
			application.NewService(awardService),
			application.NewService(reportingService),
			application.NewService(stopwatchService),
			application.NewService(dbService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(frontendFS),
		},
	})

	dbService.app = app
	stopwatchService.SetApp(app)

	if _, err := os.Stat("race_assistant.db"); err == nil {
		dbService.connectTo("race_assistant.db")
	}

	menu := app.NewMenu()
	fileMenu := menu.AddSubmenu("File")
	fileMenu.Add("New Database...").OnClick(func(ctx *application.Context) { dbService.New() })
	fileMenu.Add("Open Database...").OnClick(func(ctx *application.Context) { dbService.Open() })
	fileMenu.Add("Close Database").OnClick(func(ctx *application.Context) { dbService.Close() })
	fileMenu.AddSeparator()
	fileMenu.Add("Quit").OnClick(func(ctx *application.Context) { app.Quit() })

	raceMenu := menu.AddSubmenu("Race")
	raceMenu.Add("Select Race").OnClick(func(ctx *application.Context) { app.Event.Emit("menu:view-races", nil) })
	raceMenu.Add("New Race").OnClick(func(ctx *application.Context) { app.Event.Emit("menu:new-race", nil) })

	eventMenu := menu.AddSubmenu("Events")
	eventMenu.Add("Manage Events").OnClick(func(ctx *application.Context) { app.Event.Emit("menu:manage-events", nil) })
	eventMenu.Add("Award Configuration").OnClick(func(ctx *application.Context) { app.Event.Emit("menu:award-config", nil) })

	partMenu := menu.AddSubmenu("Participants")
	partMenu.Add("Registration").OnClick(func(ctx *application.Context) { app.Event.Emit("menu:view-participants", nil) })
	partMenu.Add("Import from CSV...").OnClick(func(ctx *application.Context) { app.Event.Emit("menu:import-participants", nil) })

	dataMenu := menu.AddSubmenu("Data Entry")
	dataMenu.Add("Enter Placements").OnClick(func(ctx *application.Context) { app.Event.Emit("menu:enter-placements", nil) })
	dataMenu.Add("Import Placements...").OnClick(func(ctx *application.Context) { app.Event.Emit("menu:import-placements", nil) })
	dataMenu.Add("Enter Times").OnClick(func(ctx *application.Context) { app.Event.Emit("menu:enter-times", nil) })

	resultMenu := menu.AddSubmenu("Results")
	resultMenu.Add("View Awards").OnClick(func(ctx *application.Context) { app.Event.Emit("menu:view-awards", nil) })
	resultMenu.Add("Reporting").OnClick(func(ctx *application.Context) { app.Event.Emit("menu:view-reporting", nil) })

	app.Menu.Set(menu)

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:      "Race Assistant",
		Width:      1024,
		Height:     768,
		StartState: application.WindowStateMaximised,
	})

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
