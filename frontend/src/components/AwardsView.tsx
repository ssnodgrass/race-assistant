import React, { useState, useEffect, useRef } from 'react';
import { AwardService, TimingService, ReportingService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { DatabaseService } from '../../bindings/github.com/ssnodgrass/race-assistant';
import { Event as RaceEvent, Result } from '../../bindings/github.com/ssnodgrass/race-assistant/models';
import { AwardCategory } from '../../bindings/github.com/ssnodgrass/race-assistant/services/models';

interface AwardsViewProps {
  events: RaceEvent[];
  mode?: 'awards' | 'standings';
  isExternal?: boolean;
  isBrowser?: boolean;
}

export const AwardsView: React.FC<AwardsViewProps> = ({ events, mode = 'awards', isExternal = false, isBrowser = false }) => {
  const [selectedID, setSelectedID] = useState<number>(0);
  const [categories, setCategories] = useState<AwardCategory[]>([]);
  const [fullResults, setFullResults] = useState<Result[]>([]);
  const [showFull, setShowFull] = useState(mode === 'standings');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (events.length > 0 && (selectedID === 0 || !events.some(e => e.id === selectedID))) {
        setSelectedID(events[0].id);
    }
  }, [events]);

  useEffect(() => {
    if (selectedID > 0) {
      loadData();
      const timer = setInterval(loadData, 5000);
      return () => clearInterval(timer);
    }
  }, [selectedID]);

  // Auto-scroll for TV Standings
  useEffect(() => {
    if (isExternal && showFull && fullResults.length > 8) {
        const scrollTimer = setInterval(() => {
            if (scrollRef.current) {
                const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
                if (scrollTop + clientHeight >= scrollHeight - 10) {
                    scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    scrollRef.current.scrollBy({ top: 150, behavior: 'smooth' });
                }
            }
        }, 4000);
        return () => clearInterval(scrollTimer);
    }
  }, [isExternal, showFull, fullResults]);

  const loadData = async () => {
    if (isBrowser) {
        try {
            const awardsRes = await fetch(`/api/awards?eventID=${selectedID}`);
            setCategories(await awardsRes.json());
            
            const resultsRes = await fetch(`/api/results?eventID=${selectedID}`);
            setFullResults(await resultsRes.json());
        } catch (e) { console.error(e); }
    } else {
        AwardService.GetAwards(selectedID).then(setCategories).catch(console.error);
        TimingService.GetEventResults(selectedID).then(setFullResults).catch(console.error);
    }
  };

  const handleDownloadPDF = () => {
    const event = events.find(e => e.id === selectedID);
    if (!event) return;
    const fileName = showFull ? `${event.name}_Full_Standings.pdf` : `${event.name}_Award_Winners.pdf`;
    
    DatabaseService.GetSavePathPDF(fileName).then((path: string) => {
        if (!path) return;
        const action = showFull ? ReportingService.GenerateStandingsPDF(selectedID, path) : ReportingService.GenerateAwardsPDF(selectedID, path);
        action.then(() => alert("PDF Generated")).catch(console.error);
    });
  };

  const handleExportCSV = () => {
    const event = events.find(e => e.id === selectedID);
    if (!event) return;
    DatabaseService.GetSavePathCSV(`${event.name}_Results.csv`).then((path: string) => {
        if (!path) return;
        ReportingService.GenerateStandingsCSV(selectedID, path)
            .then(() => alert("CSV Exported Successfully"))
            .catch(err => alert("Failed to export CSV: " + err));
    });
  };

  const renderTime = (r: Result) => {
    if (r.time) return r.time;
    if (r.unofficial_time) return `~${r.unofficial_time}`;
    return '--:--.--';
  };

  if (events.length === 0) return <div className="card">Initializing Results...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: isExternal ? 'calc(100vh - 100px)' : 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: isExternal ? '2.5em' : '1.5em', margin: 0 }}>
                {showFull ? 'Full Standings' : 'Award Winners'}
            </h2>
            <select 
                value={selectedID} 
                onChange={e => setSelectedID(Number(e.target.value))} 
                style={{ padding: '10px', fontSize: isExternal ? '1.2em' : '1em' }}
            >
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
            <select 
                value={showFull ? 'standings' : 'awards'} 
                onChange={e => setShowFull(e.target.value === 'standings')}
                style={{ padding: '10px', fontSize: isExternal ? '1.2em' : '1em', backgroundColor: 'var(--accent)', color: 'white' }}
            >
                <option value="awards">Category Winners</option>
                <option value="standings">Complete List</option>
            </select>
            {!isBrowser && !isExternal && (
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleDownloadPDF} style={{ backgroundColor: 'var(--success)' }}>
                        Export PDF
                    </button>
                    {showFull && (
                        <button onClick={handleExportCSV} style={{ backgroundColor: '#444' }}>
                            Export CSV
                        </button>
                    )}
                </div>
            )}
        </div>
      </div>

      <div ref={scrollRef} style={{ flexGrow: 1, overflowY: isExternal ? 'auto' : 'visible' }}>
        {!showFull ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
                {categories.map(cat => (
                <div key={cat.name} className="card" style={{ borderTop: '4px solid var(--accent)', backgroundColor: isExternal ? '#0a0a0a' : 'var(--bg-card)' }}>
                    <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '8px', marginTop: 0 }}>{cat.name}</h3>
                    <table style={{ width: '100%', textAlign: 'left', fontSize: isExternal ? '1.2em' : '1em' }}>
                    <tbody>
                        {cat.winners.map((w, i) => (
                        <tr key={w.bib_number} style={{ borderBottom: '1px solid #111' }}>
                            <td style={{ width: '35px', padding: '8px 0', color: 'var(--text-dim)' }}>{i + 1}.</td>
                            <td>{w.first_name} {w.last_name}</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--accent)' }}>
                                {renderTime(w)}
                            </td>
                        </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
                ))}
            </div>
        ) : (
            <div className="card" style={{ backgroundColor: isExternal ? '#0a0a0a' : 'var(--bg-card)', padding: isExternal ? '0' : '20px' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: isExternal ? '1.6em' : '1em' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: isExternal ? '#111' : 'var(--bg-input)', zIndex: 10 }}>
                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                            <th style={{ padding: '15px' }}>Plc</th><th>Bib</th><th>Name</th><th>G</th><th>Age</th><th style={{ textAlign: 'right' }}>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {fullResults.map(r => (
                            <tr key={r.bib_number} style={{ borderBottom: '1px solid #111' }}>
                                <td style={{ padding: '15px' }}>{r.event_place}</td>
                                <td>{r.bib_number}</td>
                                <td><strong>{r.first_name} {r.last_name}</strong></td>
                                <td>{r.gender}</td>
                                <td>{r.age}</td>
                                <td style={{ fontWeight: 'bold', color: 'var(--accent)', textAlign: 'right' }}>{renderTime(r)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  );
};
