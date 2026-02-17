import React, { useState, useEffect } from 'react';
import { AwardService, TimingService, ReportingService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { DatabaseService } from '../../bindings/github.com/ssnodgrass/race-assistant';
import { Event as RaceEvent, Result } from '../../bindings/github.com/ssnodgrass/race-assistant/models';
import { AwardCategory } from '../../bindings/github.com/ssnodgrass/race-assistant/services/models';

interface AwardsViewProps {
  events: RaceEvent[];
  mode?: 'awards' | 'standings';
}

export const AwardsView: React.FC<AwardsViewProps> = ({ events, mode = 'awards' }) => {
  const [selectedID, setSelectedID] = useState<number>(events[0]?.id || 0);
  const [categories, setCategories] = useState<AwardCategory[]>([]);
  const [fullResults, setFullResults] = useState<Result[]>([]);
  const [showFull, setShowFull] = useState(mode === 'standings');

  useEffect(() => {
    if (selectedID > 0) {
      loadData();
    }
  }, [selectedID]);

  const loadData = () => {
    AwardService.GetAwards(selectedID).then(setCategories).catch(console.error);
    TimingService.GetEventResults(selectedID).then(setFullResults).catch(console.error);
  };

  const handleDownloadPDF = () => {
    const event = events.find(e => e.id === selectedID);
    if (!event) return;

    if (showFull) {
        DatabaseService.GetSavePath("Save Full Standings PDF", `${event.name}_Full_Standings.pdf`).then((path: string) => {
            if (!path) return;
            ReportingService.GenerateStandingsPDF(selectedID, path)
                .then(() => alert("PDF Generated Successfully"))
                .catch(err => alert("Failed: " + err));
        });
    } else {
        DatabaseService.GetSavePath("Save Award Winners PDF", `${event.name}_Award_Winners.pdf`).then((path: string) => {
            if (!path) return;
            ReportingService.GenerateAwardsPDF(selectedID, path)
                .then(() => alert("PDF Generated Successfully"))
                .catch(err => alert("Failed: " + err));
        });
    }
  };

  if (events.length === 0) return <div className="card">No events available.</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <h2>{showFull ? 'Full Standings' : 'Award Winners'}</h2>
            <select value={selectedID} onChange={e => setSelectedID(Number(e.target.value))} style={{ padding: '5px' }}>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
            <button onClick={() => setShowFull(!showFull)} style={{ backgroundColor: '#444' }}>
                {showFull ? 'Switch to Award Categories' : 'Switch to Full Standings'}
            </button>
            <button onClick={handleDownloadPDF} style={{ backgroundColor: 'var(--success)' }}>
                Download PDF
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
                        <td style={{ width: '30px', padding: '5px 0' }}>{i + 1}.</td>
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
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
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
