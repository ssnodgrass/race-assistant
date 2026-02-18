package services

import (
	"bufio"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/ssnodgrass/race-assistant/internal/repository"
	"github.com/ssnodgrass/race-assistant/models"
	"github.com/wailsapp/wails/v3/pkg/application"
	"go.bug.st/serial"
)

type StopwatchService struct {
	app        *application.App
	timingRepo *repository.TimingRepository

	mu            sync.Mutex
	capturedTimes []models.ImportedTime
	isCapturing   bool
	stopSignal    chan struct{}
}

func NewStopwatchService(timingRepo *repository.TimingRepository) *StopwatchService {
	return &StopwatchService{
		timingRepo:    timingRepo,
		capturedTimes: []models.ImportedTime{},
	}
}

func (s *StopwatchService) SetApp(app *application.App) {
	s.app = app
}

func (s *StopwatchService) SetDB(db *sql.DB) {
	s.timingRepo.SetDB(db)
}

func (s *StopwatchService) ListPorts() ([]string, error) {
	return serial.GetPortsList()
}

func (s *StopwatchService) SendCommand(portName string, cmd string) error {
	mode := &serial.Mode{BaudRate: 9600}
	port, err := serial.Open(portName, mode)
	if err != nil {
		return err
	}
	defer port.Close()

	_, err = port.Write([]byte(cmd + "\r\n"))
	return err
}

func (s *StopwatchService) StartCapture(portName string) error {
	s.mu.Lock()
	if s.isCapturing {
		s.mu.Unlock()
		return fmt.Errorf("capture already in progress")
	}
	s.isCapturing = true
	s.stopSignal = make(chan struct{})
	s.capturedTimes = []models.ImportedTime{}
	s.mu.Unlock()

	go s.serialReaderLoop(portName)
	return nil
}

func (s *StopwatchService) StopCapture() []models.ImportedTime {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.isCapturing {
		close(s.stopSignal)
		s.isCapturing = false
	}
	return s.capturedTimes
}

func (s *StopwatchService) ParseStopwatchText(content string) []models.ImportedTime {
	var results []models.ImportedTime
	lines := strings.Split(content, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) >= 2 {
			var p int
			// Try to find a number followed by a time pattern
			_, err := fmt.Sscanf(parts[0], "%d", &p)
			if err == nil {
				results = append(results, models.ImportedTime{
					Place: p,
					Time:  parts[1],
				})
			}
		}
	}
	return results
}

func (s *StopwatchService) serialReaderLoop(portName string) {
	mode := &serial.Mode{
		BaudRate: 9600,
		DataBits: 8,
		Parity:   serial.NoParity,
		StopBits: serial.OneStopBit,
	}

	port, err := serial.Open(portName, mode)
	if err != nil {
		s.app.Event.Emit("stopwatch:error", err.Error())
		return
	}
	defer port.Close()

	scanner := bufio.NewScanner(port)
	for {
		select {
		case <-s.stopSignal:
			return
		default:
			if scanner.Scan() {
				line := scanner.Text()
				s.app.Event.Emit("stopwatch:raw", line) // Send raw lines for debug

				parts := strings.Fields(line)
				if len(parts) >= 2 {
					var p int
					if _, err := fmt.Sscanf(parts[0], "%d", &p); err == nil {
						newTime := models.ImportedTime{Place: p, Time: parts[1]}
						s.mu.Lock()
						s.capturedTimes = append(s.capturedTimes, newTime)
						s.mu.Unlock()
						s.app.Event.Emit("stopwatch:time", newTime)
					}
				}
			} else {
				time.Sleep(100 * time.Millisecond)
			}
		}
	}
}

func (s *StopwatchService) CommitToRace(raceID int, times []models.ImportedTime) (int, error) {
	count := 0
	for _, t := range times {
		pulse := &models.TimingPulse{
			RaceID:  raceID,
			Place:   t.Place,
			RawTime: t.Time,
		}
		if err := s.timingRepo.CreatePulse(pulse); err == nil {
			count++
		}
	}
	return count, nil
}
