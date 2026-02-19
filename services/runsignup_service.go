package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/ssnodgrass/race-assistant/models"
)

type RunSignUpService struct {
	db     *sql.DB
	client *http.Client
}

func NewRunSignUpService(db *sql.DB) *RunSignUpService {
	return &RunSignUpService{
		db: db,
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (s *RunSignUpService) SetDB(db *sql.DB) {
	s.db = db
}

// GetRSUEvents fetches the list of events for a given RunSignUp Race ID
func (s *RunSignUpService) GetRSUEvents(rsuRaceID string, apiKey string, apiSecret string) ([]models.RSUEvent, error) {
	if rsuRaceID == "" || apiKey == "" || apiSecret == "" {
		return nil, fmt.Errorf("missing RunSignUp credentials")
	}

	url := fmt.Sprintf("https://runsignup.com/rest/race/%s?rsu_api_key=%s&format=json", rsuRaceID, apiKey)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("X-RSU-API-SECRET", apiSecret)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	body, _ := io.ReadAll(resp.Body)
	var wrapper struct {
		Race struct {
			Events []models.RSUEvent `json:"events"`
		} `json:"race"`
	}

	if err := json.Unmarshal(body, &wrapper); err != nil {
		return nil, err
	}

	return wrapper.Race.Events, nil
}

func (s *RunSignUpService) GetParticipants(rsuRaceID string, rsuEventID string, apiKey string, apiSecret string) ([]models.Participant, error) {
	if rsuRaceID == "" || rsuEventID == "" || apiKey == "" || apiSecret == "" {
		return nil, fmt.Errorf("missing required RunSignUp credentials")
	}

	url := fmt.Sprintf("https://runsignup.com/rest/race/%s/participants?rsu_api_key=%s&event_id=%s&format=json&results_per_page=2500", rsuRaceID, apiKey, rsuEventID)

	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("X-RSU-API-SECRET", apiSecret)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	body, _ := io.ReadAll(resp.Body)
	
	var apiResponse []models.RSUEventParticipants
	if err := json.Unmarshal(body, &apiResponse); err != nil {
		return nil, fmt.Errorf("failed to parse participant JSON: %w", err)
	}

	var results []models.Participant
	for _, group := range apiResponse {
		for _, reg := range group.Participants {
			user := reg.User
			dob, _ := time.Parse("2006-01-02", user.DOB)
			
			bib := ""
			if reg.BibNum != nil {
				bib = *reg.BibNum
			}

			results = append(results, models.Participant{
				BibNumber:    bib,
				FirstName:    user.FirstName,
				LastName:     user.LastName,
				Gender:       user.Gender,
				DOB:          &dob,
				AgeOnRaceDay: reg.Age,
			})
		}
	}

	return results, nil
}
