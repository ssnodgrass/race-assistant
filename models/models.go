package models

import "time"

// RaceRSUSettings stores credentials for RunSignUp integration
type RaceRSUSettings struct {
	RaceID    string `json:"race_id"`
	APIKey    string `json:"api_key"`
	APISecret string `json:"api_secret"`
}

// Race struct
type Race struct {
	ID        int             `json:"id"`
	Name      string          `json:"name"`
	Date      time.Time       `json:"date"`
	StartTime *time.Time      `json:"start_time"`
	RSU       RaceRSUSettings `json:"rsu"`
}

// Event struct
type Event struct {
	ID               int     `json:"id"`
	RaceID           int     `json:"race_id"`
	Name             string  `json:"name"`
	DistanceKM       float64 `json:"distance_km"`
	RunSignUpEventID string  `json:"runsignup_event_id"`
}

// RSUEvent mapping
type RSUEvent struct {
	ID        int    `json:"event_id"`
	Name      string `json:"name"`
	StartTime string `json:"start_time"`
}

// RSU API Response structs
type RSUUser struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
	DOB       string `json:"dob"`
	Gender    string `json:"gender"`
	Phone     string `json:"phone"`
}

type RSURegistration struct {
	User     RSUUser `json:"user"`
	BibNum   *string `json:"bib_num"`
	Age      int     `json:"age"`
	TeamName *string `json:"team_name"`
}

type RSUEventParticipants struct {
	Participants []RSURegistration `json:"participants"`
}

type Participant struct {
	ID           int        `json:"id"`
	RaceID       int        `json:"race_id"`
	EventID      int        `json:"event_id"`
	BibNumber    string     `json:"bib_number"`
	FirstName    string     `json:"first_name"`
	LastName     string     `json:"last_name"`
	Gender       string     `json:"gender"`
	DOB          *time.Time `json:"dob"`
	AgeOnRaceDay int        `json:"age_on_race_day"`
	CheckedIn    bool       `json:"checked_in"`
}

type TimingPulse struct {
	ID      int    `json:"id"`
	RaceID  int    `json:"race_id"`
	Place   int    `json:"place"`
	RawTime string `json:"raw_time"`
}

type ImportedTime struct {
	Place int    `json:"place"`
	Time  string `json:"time"`
}

type ChuteAssignment struct {
	RaceID         int    `json:"race_id"`
	Place          int    `json:"place"`
	BibNumber      string `json:"bib_number"`
	UnofficialTime string `json:"unofficial_time"`
}

type AgeGroup struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

type AwardStrategy int

const (
	AwardStrategyPrestigious AwardStrategy = 0
	AwardStrategyDistributed AwardStrategy = 1
)

type AwardConfig struct {
	EventID                   int           `json:"event_id"`
	OverallCount              int           `json:"overall_count"`
	MastersAge                int           `json:"masters_age"`
	MastersCount              int           `json:"masters_count"`
	GrandMastersAge           int           `json:"grand_masters_age"`
	GrandMastersCount         int           `json:"grand_masters_count"`
	SeniorGrandMastersAge     int           `json:"senior_grand_masters_age"`
	SeniorGrandMastersCount   int           `json:"senior_grand_masters_count"`
	AgeGroupDepth             int           `json:"age_group_depth"`
	IncludeOverall            bool          `json:"include_overall"`
	IncludeMasters            bool          `json:"include_masters"`
	IncludeGrandMasters       bool          `json:"include_grand_masters"`
	IncludeSeniorGrandMasters bool        `json:"include_senior_grand_masters"`
	SplitGender               bool          `json:"split_gender"`
	AwardStrategy             AwardStrategy `json:"award_strategy"`
	AgeGroups                 []AgeGroup    `json:"age_groups"`
}

type Result struct {
	ChutePlace     int    `json:"chute_place"`
	EventPlace     int    `json:"event_place"`
	BibNumber      string `json:"bib_number"`
	FirstName      string `json:"first_name"`
	LastName       string `json:"last_name"`
	Gender         string `json:"gender"`
	Age            int    `json:"age"`
	Time           string `json:"time"`
	UnofficialTime string `json:"unofficial_time"`
	Pace           string `json:"pace"`
	Category       string `json:"category,omitempty"`
}
