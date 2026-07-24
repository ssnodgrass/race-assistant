package services

import (
	"testing"

	"github.com/ssnodgrass/race-assistant/models"
)

func TestParticipantsFromRSUResponseMapsGiveawayToShirtSize(t *testing.T) {
	bib := "101"
	giveaway := "Women's Medium"
	participants := participantsFromRSUResponse([]models.RSUEventParticipants{{
		Participants: []models.RSURegistration{{
			User: models.RSUUser{
				FirstName: "Alice",
				LastName:  "Smith",
				Gender:    "F",
			},
			BibNum:   &bib,
			Age:      28,
			Giveaway: &giveaway,
		}},
	}})

	if len(participants) != 1 {
		t.Fatalf("participantsFromRSUResponse returned %d participants, want 1", len(participants))
	}
	if participants[0].ShirtSize != giveaway {
		t.Fatalf("shirt size = %q, want %q", participants[0].ShirtSize, giveaway)
	}
}

func TestParticipantsFromRSUResponseAllowsMissingGiveaway(t *testing.T) {
	participants := participantsFromRSUResponse([]models.RSUEventParticipants{{
		Participants: []models.RSURegistration{{
			User: models.RSUUser{FirstName: "No", LastName: "Shirt"},
		}},
	}})

	if len(participants) != 1 {
		t.Fatalf("participantsFromRSUResponse returned %d participants, want 1", len(participants))
	}
	if participants[0].ShirtSize != "" {
		t.Fatalf("shirt size = %q, want empty", participants[0].ShirtSize)
	}
}
