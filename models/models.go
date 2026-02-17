package models

import "time"

type Race struct {
	ID   int       `json:"id"`
	Name string    `json:"name"`
	Date time.Time `json:"date"`
}

type Event struct {
	ID         int     `json:"id"`
	RaceID     int     `json:"race_id"`
	Name       string  `json:"name"`
	DistanceKM float64 `json:"distance_km"`
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
}

type TimingPulse struct {
	ID      int    `json:"id"`
	RaceID  int    `json:"race_id"`
	Place   int    `json:"place"`
	RawTime string `json:"raw_time"`
}

type ChuteAssignment struct {
	RaceID    int    `json:"race_id"`
	Place     int    `json:"place"`
	BibNumber string `json:"bib_number"`
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
	ChutePlace int    `json:"chute_place"`
	EventPlace int    `json:"event_place"`
	BibNumber  string `json:"bib_number"`
	FirstName  string `json:"first_name"`
	LastName   string `json:"last_name"`
	Gender     string `json:"gender"`
	Age        int    `json:"age"`
	Time       string `json:"time"`
	Pace       string `json:"pace"`
	Category   string `json:"category,omitempty"`
}
