import React, { useState, useEffect } from 'react';
import { TimingService, AwardService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { Event as RaceEvent, Result, Race } from '../../bindings/github.com/ssnodgrass/race-assistant/models';
import { AwardCategory } from '../../bindings/github.com/ssnodgrass/race-assistant/services/models';

interface LiveResultsProps {
  events: RaceEvent[];
  selectedRace?: Race | null;
  onRefresh?: () => void;
}

export const LiveResults: React.FC<LiveResultsProps> = ({ events, selectedRace, onRefresh }) => {
  const [selectedID, setSelectedID] = useState<number>(0);
  const [categories, setCategories] = useState<AwardCategory[]>([]);
  const [lastFinishers, setLastFinishers] = useState<Result[]>([]);
  const [elapsed, setElapsed] = useState('00:00:00');

  useEffect(() => {
    if (events.length > 0 && selectedID === 0) {
        setSelectedID(events[0].id);
    }
  }, [events]);

  useEffect(() => {
    if (selectedID > 0) {
      loadData();
      const timer = setInterval(loadData, 3000);
      return () => clearInterval(timer);
    }
  }, [selectedID]);

  useEffect(() => {
    if (!selectedRace?.start_time) {
        setElapsed('00:00:00');
        return;
    }
    const timer = setInterval(() => {
        const start = new Date(selectedRace.start_time!).getTime();
        const diff = new Date().getTime() - start;
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
  }, [selectedRace?.start_time]);

  const loadData = () => {
    if (onRefresh) onRefresh();
    AwardService.GetAwards(selectedID).then(setCategories).catch(console.error);
    TimingService.GetEventResults(selectedID).then(data => {
        const latest = [...(data || [])].sort((a, b) => b.chute_place - a.chute_place);
        setLastFinishers(latest.slice(0, 10));
    }).catch(console.error);
  };

  const getDisplayTime = (r: Result) => {
    if (r.time) return r.time;
    if (r.unofficial_time) return `~${r.unofficial_time}`;
    return '--:--.--';
  };

  if (events.length === 0) return <div style={{ textAlign: 'center', marginTop: '100px' }}><h2>Loading Race Events...</h2></div>;

  return (
    <div style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
            <h1 style={{ margin: 0, fontSize: '3em', color: 'var(--accent)' }}>Live Results</h1>
            {selectedRace?.start_time && (
                <div style={{ fontSize: '1.5em', color: 'var(--success)', fontFamily: 'monospace' }}>
                    CURRENT RACE TIME: {elapsed}
                </div>
            )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '1.2em' }}>Event:</span>
            <select 
                value={selectedID} 
                onChange={e => setSelectedID(Number(e.target.value))}
                style={{ fontSize: '1.2em', padding: '10px 20px', backgroundColor: '#222', border: '1px solid #444' }}
            >
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '30px', flexGrow: 1, overflow: 'hidden' }}>
        <div className="card" style={{ flex: 1, backgroundColor: '#0a0a0a', border: '2px solid #222' }}>
            <h2 style={{ borderBottom: '1px solid #333', paddingBottom: '15px', color: 'var(--text-dim)' }}>Latest Finishers</h2>
            <table style={{ width: '100%', fontSize: '1.6em', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ color: 'var(--text-dim)', textAlign: 'left', fontSize: '0.6em' }}>
                        <th>PLC</th><th>BIB</th><th>NAME</th><th>TIME</th>
                    </tr>
                </thead>
                <tbody>
                    {lastFinishers.map(r => (
                        <tr key={r.bib_number} style={{ borderBottom: '1px solid #111' }}>
                            <td style={{ padding: '10px 0' }}>{r.chute_place}</td>
                            <td>{r.bib_number}</td>
                            <td><strong>{r.first_name} {r.last_name}</strong></td>
                            <td style={{ color: 'var(--accent)', textAlign: 'right' }}>{getDisplayTime(r)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        <div style={{ flex: 1.2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', overflowY: 'auto', alignContent: 'start' }}>
            {categories.map(cat => (
                <div key={cat.name} className="card" style={{ borderLeft: '6px solid var(--accent)', margin: 0, backgroundColor: '#0a0a0a', padding: '15px' }}>
                    <h3 style={{ fontSize: '0.9em', color: 'var(--text-dim)', marginBottom: '10px', textTransform: 'uppercase', borderBottom: '1px solid #222', paddingBottom: '5px' }}>{cat.name}</h3>
                    {cat.winners.map((w, i) => (
                        <div key={w.bib_number} style={{ fontSize: '1.2em', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.8em', marginRight: '8px' }}>{i+1}.</span>
                                {w.first_name} {w.last_name}
                            </div>
                            <div style={{ fontSize: '0.8em', color: 'var(--accent)', fontWeight: 'bold' }}>{getDisplayTime(w)}</div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};
