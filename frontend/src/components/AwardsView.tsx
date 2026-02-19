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
    if ((isExternal || isBrowser) && showFull && fullResults.length > 8) {
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
  }, [isExternal, isBrowser, showFull, fullResults]);

  const loadData = async () => {
    if (isBrowser) {
        try {
            const awardsRes = await fetch(`/api/awards?eventID=${selectedID}`);
            const awardData = await awardsRes.json();
            setCategories(awardData || []);
            
            const resultsRes = await fetch(`/api/results?eventID=${selectedID}`);
            const data = await resultsRes.json();
            setFullResults(data || []);
        } catch (e) { console.error(e); }
    } else {
        AwardService.GetAwards(selectedID).then(data => setCategories(data || [])).catch(console.error);
        TimingService.GetEventResults(selectedID).then(data => setFullResults(data || [])).catch(console.error);
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

  if (events.length === 0) return (
    <div className="card">Initializing Results...</div>
  );

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: (isExternal || isBrowser) ? '100%' : 'auto',
    overflow: 'hidden'
  };

  return (
    <div style={containerStyle}>
      <div className="flex-between" style={{ marginBottom: 'var(--space-lg)', flexShrink: 0 }}>
        <div className="flex-row" style={{ flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: (isExternal || isBrowser) ? '2.5rem' : '1.8rem', margin: 0 }}>
                {showFull ? 'Full Standings' : 'Award Winners'}
            </h2>
            <select 
                value={selectedID} 
                onChange={e => setSelectedID(Number(e.target.value))} 
                style={{ padding: '10px', fontSize: (isExternal || isBrowser) ? '1.2rem' : '1rem', minWidth: '200px' }}
            >
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
            <select 
                value={showFull ? 'standings' : 'awards'} 
                onChange={e => setShowFull(e.target.value === 'standings')}
                style={{ padding: '10px', fontSize: (isExternal || isBrowser) ? '1.2rem' : '1rem', backgroundColor: 'var(--accent)', color: 'white' }}
            >
                <option value="awards">Category Winners</option>
                <option value="standings">Complete List</option>
            </select>
        </div>
        {!isBrowser && !isExternal && (
            <div className="flex-row">
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

      <div ref={scrollRef} style={{ flexGrow: 1, overflowY: 'auto' }}>
        {!showFull ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 'var(--space-lg)' }}>
                {(categories || []).map(cat => (
                <div key={cat.name} className="card" style={{ borderTop: '4px solid var(--accent)', margin: 0 }}>
                    <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-sm)', marginTop: 0, fontSize: (isExternal || isBrowser) ? '1.6rem' : '1.3rem' }}>{cat.name}</h3>
                    <table style={{ width: '100%', textAlign: 'left', fontSize: (isExternal || isBrowser) ? '1.3rem' : '1rem' }}>
                    <tbody>
                        {(cat.winners || []).map((w, i) => (
                        <tr key={w.bib_number}>
                            <td style={{ width: '40px', color: 'var(--text-dim)' }}>{i + 1}.</td>
                            <td><strong>{w.first_name} {w.last_name}</strong></td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>
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
            <div className="card" style={{ padding: 0, overflow: 'visible' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: (isExternal || isBrowser) ? '1.6rem' : '1rem' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 10 }}>
                        <tr>
                            <th style={{ paddingLeft: 'var(--space-md)' }}>Plc</th>
                            <th>Bib</th>
                            <th>Name</th>
                            <th>G</th>
                            <th>Age</th>
                            <th style={{ textAlign: 'right', paddingRight: 'var(--space-md)' }}>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(fullResults || []).map(r => (
                            <tr key={r.bib_number}>
                                <td style={{ paddingLeft: 'var(--space-md)' }}>{r.event_place}</td>
                                <td><strong>{r.bib_number}</strong></td>
                                <td>{r.first_name} {r.last_name}</td>
                                <td>{r.gender}</td>
                                <td>{r.age}</td>
                                <td style={{ fontWeight: 800, color: 'var(--accent)', textAlign: 'right', paddingRight: 'var(--space-md)' }}>{renderTime(r)}</td>
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
