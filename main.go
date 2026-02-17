package main

import (
	"database/sql"
	"embed"
	"fmt"
	"log"
	"os"

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
	services  []serviceWithDB
}

type serviceWithDB interface {
	SetDB(db *sql.DB)
}

func (s *DatabaseService) New() {
	log.Println("[Action] New Database")
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
	log.Println("[Action] Open Database")
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
	log.Println("[Action] Close Database")
	if s.currentDB != nil {
		s.currentDB.Close()
		s.currentDB = nil
	}
	for _, service := range s.services {
		service.SetDB(nil)
	}
	s.app.Event.Emit("db:closed", nil)
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
	for _, service := range s.services {
		service.SetDB(db)
	}
	s.app.Event.Emit("db:connected", path)
}

func (s *DatabaseService) GetFilePath(title string) string {
	result, _ := s.app.Dialog.OpenFile().
		SetTitle(title).
		AddFilter("CSV Files (*.csv)", "*.csv").
		PromptForSingleSelection()
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

	dbService := &DatabaseService{
		services: []serviceWithDB{
			raceService,
			eventService,
			participantService,
			timingService,
			awardService,
		},
	}

	app := application.New(application.Options{
		Name:        "Race Assistant",
		Description: "Road Race Registration and Timing System",
		Services: []application.Service{
			application.NewService(raceService),
			application.NewService(eventService),
			application.NewService(participantService),
			application.NewService(timingService),
			application.NewService(awardService),
			application.NewService(dbService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})

	dbService.app = app

	// Auto-open race_assistant.db if it exists
	if _, err := os.Stat("race_assistant.db"); err == nil {
		log.Println("Auto-opening race_assistant.db")
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
	partMenu.Add("Import from RunSignUp...").OnClick(func(ctx *application.Context) { app.Event.Emit("menu:import-participants", nil) })

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
