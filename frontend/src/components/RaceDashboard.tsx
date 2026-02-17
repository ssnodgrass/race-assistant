import React from 'react';
import { Race, Event as RaceEvent, Participant } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface RaceDashboardProps {
  race: Race;
  events: RaceEvent[];
  participants: Participant[];
}

export const RaceDashboard: React.FC<RaceDashboardProps> = ({ race, events, participants }) => {
  return (
    <div>
      <h1>{race.name}</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: '30px' }}>Date: {new Date(race.date).toLocaleDateString()}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        <div className="card">
          <h3>Events</h3>
          <p style={{ fontSize: '2.5em', fontWeight: 'bold', margin: '10px 0' }}>{events.length}</p>
          <ul style={{ paddingLeft: '20px', color: 'var(--text-dim)' }}>
            {events.map(ev => <li key={ev.id}>{ev.name} ({ev.distance_km} km)</li>)}
          </ul>
        </div>
        
        <div className="card">
          <h3>Participants</h3>
          <p style={{ fontSize: '2.5em', fontWeight: 'bold', margin: '10px 0' }}>{participants.length}</p>
          <p style={{ color: 'var(--text-dim)' }}>Runners registered across all events.</p>
        </div>

        <div className="card">
          <h3>Pace Units</h3>
          <p style={{ fontSize: '1.2em', fontWeight: 'bold', margin: '10px 0' }}>Miles (min/mi)</p>
          <p style={{ color: 'var(--text-dim)' }}>Results are shown in min/mi based on KM distance.</p>
        </div>
      </div>
    </div>
  );
};
