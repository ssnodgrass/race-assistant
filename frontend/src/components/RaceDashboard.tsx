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
  const [rsuAPIKey, setRsuAPIKey] = useState(race.rsu?.api_key || '');
  const [rsuAPISecret, setRsuAPISecret] = useState(race.rsu?.api_secret || '');

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
    setRsuAPIKey(race.rsu?.api_key || '');
    setRsuAPISecret(race.rsu?.api_secret || '');
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
            race_id: rsuRaceID,
            api_key: rsuAPIKey,
            api_secret: rsuAPISecret
        }
    });
    RaceService.UpdateRace(r).then(() => {
        alert("RunSignUp Settings Saved");
        onRefresh();
    }).catch(console.error);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex-between" style={{ alignItems: 'flex-start', marginBottom: 'var(--space-xl)' }}>
        <div>
            <h1>{race.name}</h1>
            <p className="text-dim" style={{ fontSize: '1.1rem' }}>Date: {new Date(race.date).toLocaleDateString()}</p>
        </div>
        
        <div className="card" style={{ border: '2px solid var(--accent)', textAlign: 'center', minWidth: '320px', margin: 0 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Race Clock (Unofficial)</div>
            <div style={{ fontSize: '4rem', fontWeight: 800, fontFamily: 'monospace', margin: '8px 0', color: 'var(--text-main)' }}>{elapsed}</div>
            
            <div style={{ marginTop: 'var(--space-md)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-md)' }}>
                {!race.start_time ? (
                    <div>
                        <label>Sync Current Time (HH:MM:SS)</label>
                        <input 
                            value={manualTime} 
                            onChange={e => setManualTime(e.target.value)}
                            style={{ fontSize: '1.2rem', width: '140px', textAlign: 'center', marginBottom: 'var(--space-md)' }}
                        />
                        <button onClick={handleStart} style={{ backgroundColor: 'var(--success)', width: '100%' }}>START CLOCK</button>
                    </div>
                ) : (
                    <button onClick={handleReset} style={{ backgroundColor: 'var(--danger)', width: '100%' }}>RESET CLOCK</button>
                )}
            </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-lg)' }}>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>Events</h3>
          <p style={{ fontSize: '3rem', fontWeight: 800, margin: '16px 0' }}>{events.length}</p>
          <ul style={{ paddingLeft: '24px', color: 'var(--text-dim)' }}>
            {events.map(ev => <li key={ev.id} style={{ marginBottom: '4px' }}>{ev.name} ({ev.distance_km} km)</li>)}
          </ul>
        </div>
        
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>Registration</h3>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', margin: '24px 0' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', fontWeight: 800 }}>{participants.length}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Registered</div>
            </div>
            <div style={{ fontSize: '2.5rem', color: 'var(--border)', fontWeight: 300 }}>/</div>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--success)' }}>{checkedInCount}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Checked In</div>
            </div>
          </div>
          <div style={{ textAlign: 'center', backgroundColor: '#ffffff05', padding: '8px', borderRadius: '4px' }}>
            <span className="text-dim">{participants.length - checkedInCount} runners remaining</span>
          </div>
        </div>

        <div className="card" style={{ borderTop: '4px solid var(--accent)', margin: 0 }}>
            <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>RunSignUp Integration</h3>
            <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>RACE ID</label>
                <input value={rsuRaceID} onChange={e => setRsuRaceID(e.target.value)} placeholder="e.g. 54529" style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>API KEY</label>
                <input type="password" value={rsuAPIKey} onChange={e => setRsuAPIKey(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: 'var(--space-md)' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>API SECRET</label>
                <input type="password" value={rsuAPISecret} onChange={e => setRsuAPISecret(e.target.value)} style={{ width: '100%' }} />
            </div>
            <button onClick={handleSaveRSU} style={{ width: '100%', backgroundColor: 'var(--accent)' }}>Save RSU Config</button>
        </div>
      </div>
    </div>
  );
};
