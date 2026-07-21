import React, { useState, useEffect, useRef } from 'react';
import { AwardService, TimingService, ReportingService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { DatabaseService } from '../../bindings/github.com/ssnodgrass/race-assistant';
import { Event as RaceEvent, Result } from '../../bindings/github.com/ssnodgrass/race-assistant/models';
import { AwardCategory } from '../../bindings/github.com/ssnodgrass/race-assistant/services/models';
import { getRunnerAwardStanding } from '../utils/awardLookup';
import { formatStoredElapsedHundredths } from '../utils/companionClock';
import './AwardsView.css';

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
  const [resultSearch, setResultSearch] = useState('');
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
    if (r.time) return formatStoredElapsedHundredths(r.time);
    if (r.unofficial_time) return `~${formatStoredElapsedHundredths(r.unofficial_time)}`;
    return '--:--.--';
  };

  const normalizedSearch = resultSearch.trim().toLowerCase();
  const matchingResults = normalizedSearch
    ? fullResults.filter(r =>
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(normalizedSearch) ||
        r.bib_number.toLowerCase().includes(normalizedSearch)
      )
    : fullResults;

  const standingFor = (runner: Result) => getRunnerAwardStanding(runner, fullResults, categories);

  const renderStanding = (runner: Result) => {
    const standing = standingFor(runner);
    if (!standing) return <span className="text-dim">No configured age group</span>;
    return (
      <span className={`award-standing ${standing.isAwardWinner ? 'award-standing-winner' : ''}`}>
        {standing.category} · #{standing.place}{standing.isAwardWinner ? ' award' : ''}
      </span>
    );
  };

  if (events.length === 0) return (
    <div className="card">Initializing Results...</div>
  );

  return (
    <div className="awards-view">
      <div className="awards-toolbar">
        <div className="awards-controls">
            <h2 style={{ fontSize: (isExternal || isBrowser) ? '2.5rem' : '1.8rem', margin: '0 var(--space-sm) 5px 0' }}>
                Awards / Results
            </h2>
            <label className="awards-control">
                Event
                <select className="awards-select" value={selectedID} onChange={e => setSelectedID(Number(e.target.value))}>
                    {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                </select>
            </label>
            <label className="awards-control">
                View
                <select className="awards-select" value={showFull ? 'standings' : 'awards'} onChange={e => setShowFull(e.target.value === 'standings')}>
                    <option value="awards">Category Winners</option>
                    <option value="standings">Complete Results</option>
                </select>
            </label>
            <label className="awards-control">
                Find Runner
                <input
                    className="awards-search"
                    type="search"
                    value={resultSearch}
                    onChange={e => setResultSearch(e.target.value)}
                    placeholder="Name or bib number"
                    aria-label="Find a runner by name or bib number"
                />
            </label>
        </div>
        {!isBrowser && !isExternal && (
            <div className="awards-actions">
                <button onClick={handleDownloadPDF} style={{ backgroundColor: 'var(--success)' }}>
                    Export PDF
                </button>
                <button onClick={handleExportCSV} style={{ backgroundColor: '#444' }}>
                    Export CSV
                </button>
            </div>
        )}
      </div>

      <div ref={scrollRef} style={{ flexGrow: 1, overflowY: 'auto' }}>
        {normalizedSearch && !showFull && (
          <div className="table-card runner-lookup">
            <h3>Runner Lookup</h3>
            <table>
              <thead>
                <tr>
                  <th>Bib</th>
                  <th>Name</th>
                  <th>Overall</th>
                  <th>Time</th>
                  <th>Award / Age-Group Standing</th>
                </tr>
              </thead>
              <tbody>
                {matchingResults.map(runner => (
                  <tr key={runner.bib_number}>
                    <td><strong>{runner.bib_number}</strong></td>
                    <td>{runner.first_name} {runner.last_name}</td>
                    <td>#{runner.event_place}</td>
                    <td style={{ fontWeight: 800, color: 'var(--accent)' }}>{renderTime(runner)}</td>
                    <td>{renderStanding(runner)}</td>
                  </tr>
                ))}
                {matchingResults.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-dim)' }}>
                      No results match “{resultSearch.trim()}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
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
                            <td><strong>{w.first_name} {w.last_name}</strong><span className="award-bib">Bib {w.bib_number}</span></td>
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
            <div className="table-card" style={{ overflow: 'visible' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: (isExternal || isBrowser) ? '1.6rem' : '1rem' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr>
                            <th style={{ paddingLeft: 'var(--space-md)' }}>Plc</th>
                            <th>Bib</th>
                            <th>Name</th>
                            <th>G</th>
                            <th>Age</th>
                            <th>Award / Age Group</th>
                            <th style={{ textAlign: 'right', paddingRight: 'var(--space-md)' }}>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matchingResults.map(r => (
                            <tr key={r.bib_number}>
                                <td style={{ paddingLeft: 'var(--space-md)' }}>{r.event_place}</td>
                                <td><strong>{r.bib_number}</strong></td>
                                <td>{r.first_name} {r.last_name}</td>
                                <td>{r.gender}</td>
                                <td>{r.age}</td>
                                <td>{renderStanding(r)}</td>
                                <td style={{ fontWeight: 800, color: 'var(--accent)', textAlign: 'right', paddingRight: 'var(--space-md)' }}>{renderTime(r)}</td>
                            </tr>
                        ))}
                        {normalizedSearch && matchingResults.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-dim)' }}>
                                    No results match “{resultSearch.trim()}”.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  );
};
