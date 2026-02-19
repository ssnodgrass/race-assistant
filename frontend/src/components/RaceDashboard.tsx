import React, { useState, useEffect } from 'react';
import { RaceService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { Race, Event as RaceEvent, Participant } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface RaceDashboardProps {
  race: Race;
  events: RaceEvent[];
  participants: Participant[];
  onRefresh: () => void;
}

export const RaceDashboard: React.FC<RaceDashboardProps> = ({ race, events, participants, onRefresh }) => {
  const [elapsed, setElapsed] = useState('00:00:00');
  const [manualTime, setManualTime] = useState('00:00:00');
  const [rsuRaceID, setRsuRaceID] = useState(race.rsu?.race_id || '');

  const checkedInCount = participants.filter(p => p.checked_in).length;

  useEffect(() => {
    if (!race.start_time) {
        setElapsed('00:00:00');
        return;
    }

    const timer = setInterval(() => {
        const start = new Date(race.start_time!).getTime();
        const now = new Date().getTime();
        const diff = now - start;
        
        if (diff < 0) {
            setElapsed('00:00:00');
            return;
        }

        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        
        setElapsed(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [race.start_time]);

  useEffect(() => {
    setRsuRaceID(race.rsu?.race_id || '');
  }, [race.id, race.rsu]);

  const handleStart = () => {
    const parts = manualTime.split(':');
    if (parts.length !== 3) return alert("Use HH:MM:SS format");
    
    const h = parseInt(parts[0]) || 0;
    const m = parseInt(parts[1]) || 0;
    const s = parseInt(parts[2]) || 0;
    
    const offsetMs = (h * 3600 + m * 60 + s) * 1000;
    const calculatedStart = new Date(new Date().getTime() - offsetMs);

    if (window.confirm(`Start race with ${manualTime} elapsed?`)) {
        const r = new Race({ ...race, start_time: calculatedStart.toISOString() as any });
        RaceService.UpdateRace(r).then(onRefresh).catch(console.error);
    }
  };

  const handleReset = () => {
    if (window.confirm("Reset the race clock? This will clear the start time.")) {
        RaceService.ResetRace(race.id).then(onRefresh).catch(console.error);
    }
  };

  const handleSaveRSU = () => {
    const r = new Race({ 
        ...race, 
        rsu: {
            race_id: rsuRaceID
        }
    });
    RaceService.UpdateRace(r).then(() => {
        alert("Race ID Saved");
        onRefresh();
    }).catch(console.error);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
            <h1>{race.name}</h1>
            <p style={{ color: 'var(--text-dim)', marginBottom: '30px' }}>Date: {new Date(race.date).toLocaleDateString()}</p>
        </div>
        
        <div className="card" style={{ border: '2px solid var(--accent)', textAlign: 'center', minWidth: '300px' }}>
            <div style={{ fontSize: '0.8em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Race Clock (Unofficial)</div>
            <div style={{ fontSize: '3.5em', fontWeight: 'bold', fontFamily: 'monospace', margin: '5px 0' }}>{elapsed}</div>
            
            <div style={{ marginTop: '15px', borderTop: '1px solid #333', paddingTop: '15px' }}>
                {!race.start_time ? (
                    <div>
                        <label style={{ fontSize: '0.8em', color: 'var(--text-dim)' }}>Sync Current Time (HH:MM:SS):</label><br/>
                        <input 
                            value={manualTime} 
                            onChange={e => setManualTime(e.target.value)}
                            style={{ fontSize: '1.2em', width: '120px', textAlign: 'center', margin: '10px 0' }}
                        /><br/>
                        <button onClick={handleStart} style={{ backgroundColor: 'var(--success)', width: '100%' }}>START CLOCK</button>
                    </div>
                ) : (
                    <button onClick={handleReset} style={{ backgroundColor: 'var(--danger)', width: '100%' }}>RESET CLOCK</button>
                )}
            </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginTop: '30px' }}>
        <div className="card">
          <h3>Events</h3>
          <p style={{ fontSize: '2.5em', fontWeight: 'bold', margin: '10px 0' }}>{events.length}</p>
          <ul style={{ paddingLeft: '20px', color: 'var(--text-dim)' }}>
            {events.map(ev => <li key={ev.id}>{ev.name} ({ev.distance_km} km)</li>)}
          </ul>
        </div>
        
        <div className="card">
          <h3>Registration</h3>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', margin: '10px 0' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.5em', fontWeight: 'bold' }}>{participants.length}</div>
                <div style={{ fontSize: '0.8em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Total</div>
            </div>
            <div style={{ fontSize: '2em', color: '#444' }}>/</div>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.5em', fontWeight: 'bold', color: 'var(--success)' }}>{checkedInCount}</div>
                <div style={{ fontSize: '0.8em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Checked In</div>
            </div>
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9em', textAlign: 'center', marginTop: '10px' }}>
            {participants.length - checkedInCount} runners remaining to check in.
          </p>
        </div>

        <div className="card" style={{ borderTop: '4px solid var(--accent)' }}>
            <h3>RunSignUp Link</h3>
            <div style={{ marginBottom: '15px' }}>
                <label>RunSignUp Race ID:</label><br/>
                <input value={rsuRaceID} onChange={e => setRsuRaceID(e.target.value)} style={{ width: '100%' }} placeholder="e.g. 54529" />
            </div>
            <button onClick={handleSaveRSU} style={{ width: '100%', backgroundColor: 'var(--accent)' }}>Link Race</button>
        </div>
      </div>
    </div>
  );
};
