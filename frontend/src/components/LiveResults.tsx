import React, { useState, useEffect } from 'react';
import { TimingService, AwardService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { Event as RaceEvent, Result, Race } from '../../bindings/github.com/ssnodgrass/race-assistant/models';
import { AwardCategory } from '../../bindings/github.com/ssnodgrass/race-assistant/services/models';

interface LiveResultsProps {
  events: RaceEvent[];
  selectedRace?: Race | null;
  onRefresh?: () => void;
  isBrowser?: boolean;
}

export const LiveResults: React.FC<LiveResultsProps> = ({ events, selectedRace, onRefresh, isBrowser = false }) => {
  const [selectedID, setSelectedID] = useState<number>(0);
  const [categories, setCategories] = useState<AwardCategory[]>([]);
  const [lastFinishers, setLastFinishers] = useState<Result[]>([]);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [resultSearch, setResultSearch] = useState('');

  useEffect(() => {
    if (events.length > 0 && (selectedID === 0 || !events.some(e => e.id === selectedID))) {
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

  // Main Race Clock
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
        const cs = Math.floor((diff % 1000) / 10);
        setElapsed(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`);
    }, 50);
    return () => clearInterval(timer);
  }, [selectedRace?.start_time]);

  const loadData = async () => {
    if (onRefresh) onRefresh();

    if (isBrowser) {
        try {
            const awardsRes = await fetch(`/api/awards?eventID=${selectedID}`);
            setCategories(await awardsRes.json());
            const resultsRes = await fetch(`/api/results?eventID=${selectedID}`);
            const data = await resultsRes.json();
            const latest = [...(data || [])].sort((a, b) => b.chute_place - a.chute_place);
            setLastFinishers(latest);
        } catch (e) { console.error(e); }
    } else {
        AwardService.GetAwards(selectedID).then(setCategories).catch(console.error);
        TimingService.GetEventResults(selectedID).then(data => {
            const latest = [...(data || [])].sort((a, b) => b.chute_place - a.chute_place);
            setLastFinishers(latest);
        }).catch(console.error);
    }
  };

  const getDisplayTime = (r: Result) => {
    if (r.time) return r.time;
    if (r.unofficial_time) return `~${r.unofficial_time}`;
    return '--:--.--';
  };

  const normalizedSearch = resultSearch.trim().toLowerCase();
  const visibleFinishers = normalizedSearch
    ? lastFinishers.filter(r =>
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(normalizedSearch) ||
        r.bib_number.toLowerCase().includes(normalizedSearch)
      )
    : lastFinishers.slice(0, 10);

  if (events.length === 0) return <div style={{ textAlign: 'center', marginTop: '100px' }}><h2>Loading Race Events...</h2></div>;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div className="flex-between">
        <div>
            <h1 style={{ margin: 0, fontSize: '3.5rem', color: 'var(--accent)' }}>Live Results</h1>
            {selectedRace?.start_time && (
                <div style={{ fontSize: '1.8rem', color: 'var(--success)', fontFamily: 'monospace', fontWeight: 700 }}>
                    RACE ELAPSED: {elapsed}
                </div>
            )}
            <div style={{ marginTop: 4, color: 'var(--text-dim)', fontSize: '0.95rem' }}>Times prefixed with ~ are approximate chute captures pending a finish-line time.</div>
        </div>
        <div className="flex-row">
            <input
                type="search"
                value={resultSearch}
                onChange={e => setResultSearch(e.target.value)}
                placeholder="Search name or bib"
                aria-label="Search live results by name or bib number"
                style={{ fontSize: '1.2rem', padding: '12px 16px', minWidth: '240px' }}
            />
            <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>EVENT:</span>
            <select 
                value={selectedID} 
                onChange={e => setSelectedID(Number(e.target.value))}
                style={{ fontSize: '1.5rem', padding: '12px 24px', minWidth: '300px' }}
            >
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-xl)', flexGrow: 1, overflow: 'hidden' }}>
        <div className="table-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: '1.5rem', margin: 0 }}>
                {normalizedSearch ? `Matching Finishers (${visibleFinishers.length})` : 'Latest Finishers'}
            </h2>
            <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                <table style={{ fontSize: '1.8rem' }}>
                    <thead>
                        <tr><th>PLC</th><th>BIB</th><th>NAME</th><th style={{ textAlign: 'right' }}>TIME</th></tr>
                    </thead>
                    <tbody>
                        {visibleFinishers.map(r => (
                            <tr key={r.bib_number}>
                                <td>{r.chute_place}</td>
                                <td>{r.bib_number}</td>
                                <td><strong>{r.first_name} {r.last_name}</strong></td>
                                <td style={{ color: 'var(--accent)', textAlign: 'right', fontWeight: 800 }}>{getDisplayTime(r)}</td>
                            </tr>
                        ))}
                        {normalizedSearch && visibleFinishers.length === 0 && (
                            <tr>
                                <td colSpan={4} style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-dim)' }}>
                                    No results match “{resultSearch.trim()}”.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        <div style={{ flex: 1.2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', overflowY: 'auto', alignContent: 'start' }}>
            {categories.map(cat => (
                <div key={cat.name} className="card" style={{ borderLeft: '6px solid var(--accent)', margin: 0, padding: 'var(--space-md)' }}>
                    <h3 style={{ fontSize: '1rem', color: 'var(--text-dim)', marginBottom: 'var(--space-sm)', textTransform: 'uppercase', borderBottom: '1px solid #222', paddingBottom: '4px' }}>{cat.name}</h3>
                    {cat.winners.map((w, i) => (
                        <div key={w.bib_number} style={{ fontSize: '1.4rem', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.8em', marginRight: '8px' }}>{i+1}.</span>
                                <strong>{w.first_name} {w.last_name}</strong>
                            </div>
                            <div style={{ fontSize: '0.9em', color: 'var(--accent)', fontWeight: 800 }}>{getDisplayTime(w)}</div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};
