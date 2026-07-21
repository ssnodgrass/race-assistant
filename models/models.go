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
	EventID int    `json:"event_id"`
	Place   int    `json:"place"`
	RawTime string `json:"raw_time"`
}

type ImportedTime struct {
	Place int    `json:"place"`
	Time  string `json:"time"`
}

type ChuteAssignment struct {
	RaceID         int    `json:"race_id"`
	EventID        int    `json:"event_id"`
	Place          int    `json:"place"`
	BibNumber      string `json:"bib_number"`
	UnofficialTime string `json:"unofficial_time"`
}

type CompanionSession struct {
	ID        string `json:"id"`
	RaceID    int    `json:"race_id"`
	EventID   int    `json:"event_id"`
	Status    string `json:"status"`
	CreatedAt int64  `json:"created_at_unix_ms"`
	ExpiresAt int64  `json:"expires_at_unix_ms"`
}

type CompanionDevice struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	LastSeen int64  `json:"last_seen_at_unix_ms"`
	Revoked  bool   `json:"revoked"`
	Role     string `json:"role"`
}

type CompanionState struct {
	Session       *CompanionSession `json:"session"`
	Devices       []CompanionDevice `json:"devices"`
	RaceName      string            `json:"race_name"`
	EventName     string            `json:"event_name"`
	RaceStart     *time.Time        `json:"race_start"`
	TimeCount     int               `json:"time_count"`
	BibCount      int               `json:"bib_count"`
	NextTimePlace int               `json:"next_time_place"`
	NextBibPlace  int               `json:"next_bib_place"`
	DuplicateBibs []string          `json:"duplicate_bibs"`
}

type CompanionPairing struct {
	Token       string `json:"token"`
	Code        string `json:"code"`
	URL         string `json:"url"`
	FallbackURL string `json:"fallback_url"`
	ExpiresAt   int64  `json:"expires_at_unix_ms"`
}

type CompanionSetup struct {
	HTTPSURL             string `json:"https_url"`
	BootstrapURL         string `json:"bootstrap_url"`
	FallbackHTTPSURL     string `json:"fallback_https_url"`
	FallbackBootstrapURL string `json:"fallback_bootstrap_url"`
	StableHostname       string `json:"stable_hostname"`
	LANIP                string `json:"lan_ip"`
	CAFingerprint        string `json:"ca_fingerprint"`
	DiscoveryError       string `json:"discovery_error"`
	ServerError          string `json:"server_error"`
}

type CompanionEntry struct {
	RequestID         string  `json:"request_id"`
	Kind              string  `json:"kind"`
	CapturedAt        int64   `json:"captured_at_unix_ms"`
	ClientCapturedAt  int64   `json:"client_captured_at_unix_ms"`
	CalibrationAt     int64   `json:"calibration_at_unix_ms"`
	CalibrationOffset float64 `json:"calibration_offset_ms"`
	BibNumber         string  `json:"bib_number"`
	UncertaintyMS     float64 `json:"uncertainty_ms"`
}

type CompanionAck struct {
	RequestID       string `json:"request_id"`
	Status          string `json:"status"`
	Place           int    `json:"place"`
	Elapsed         string `json:"elapsed"`
	BibNumber       string `json:"bib_number"`
	ParticipantName string `json:"participant_name"`
	EventName       string `json:"event_name"`
	Warning         string `json:"warning"`
}

type SegmentEventSelection struct {
	Segment int `json:"segment"`
	EventID int `json:"event_id"`
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
	IncludeSeniorGrandMasters bool          `json:"include_senior_grand_masters"`
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
