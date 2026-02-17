import React, { useState, useEffect } from 'react';
import { AwardService, TimingService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { Event as RaceEvent, Result } from '../../bindings/github.com/ssnodgrass/race-assistant/models';
import { AwardCategory } from '../../bindings/github.com/ssnodgrass/race-assistant/services/models';

interface AwardsViewProps {
  events: RaceEvent[];
}

export const AwardsView: React.FC<AwardsViewProps> = ({ events }) => {
  const [selectedID, setSelectedID] = useState<number>(events[0]?.id || 0);
  const [categories, setCategories] = useState<AwardCategory[]>([]);
  const [fullResults, setFullResults] = useState<Result[]>([]);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (selectedID > 0) {
      loadData();
    }
  }, [selectedID]);

  const loadData = () => {
    AwardService.GetAwards(selectedID).then(setCategories).catch(console.error);
    TimingService.GetEventResults(selectedID).then(setFullResults).catch(console.error);
  };

  if (events.length === 0) return <div className="card">No events available.</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <h2>Results:</h2>
            <select value={selectedID} onChange={e => setSelectedID(Number(e.target.value))}>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
            <button onClick={() => setShowFull(!showFull)}>
                {showFull ? 'View Award Winners' : 'View Full Results'}
            </button>
        </div>
      </div>

      {!showFull ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
            {categories.map(cat => (
            <div key={cat.name} className="card" style={{ borderTop: '4px solid var(--accent)' }}>
                <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginTop: 0 }}>{cat.name}</h3>
                <table style={{ width: '100%', textAlign: 'left' }}>
                <tbody>
                    {cat.winners.map((w, i) => (
                    <tr key={w.bib_number}>
                        <td style={{ width: '30px' }}>{i + 1}.</td>
                        <td>{w.first_name} {w.last_name}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                            {w.time || '--:--.--'}
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
            ))}
        </div>
      ) : (
        <div className="card">
            <h3>Full Event Standings</h3>
            <table>
                <thead>
                    <tr><th>Place</th><th>Bib</th><th>Name</th><th>Gender</th><th>Age</th><th>Time</th><th>Pace</th></tr>
                </thead>
                <tbody>
                    {fullResults.map(r => (
                        <tr key={r.bib_number}>
                            <td>{r.event_place}</td>
                            <td>{r.bib_number}</td>
                            <td>{r.first_name} {r.last_name}</td>
                            <td>{r.gender}</td>
                            <td>{r.age}</td>
                            <td style={{ fontWeight: 'bold' }}>{r.time || '--:--.--'}</td>
                            <td style={{ fontSize: '0.9em', color: 'var(--text-dim)' }}>{r.pace}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      )}
    </div>
  );
};
