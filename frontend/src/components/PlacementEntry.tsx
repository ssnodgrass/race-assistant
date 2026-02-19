import React, { useState, useEffect, useRef } from 'react';
import { TimingService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { Participant, Event as RaceEvent, ChuteAssignment, Race } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface PlacementEntryProps {
  race: Race;
  participants: Participant[];
  events: RaceEvent[];
  onRefresh: () => void;
  onBack?: () => void;
}

export const PlacementEntry: React.FC<PlacementEntryProps> = ({ race, participants, events, onRefresh, onBack }) => {
  const [placements, setPlacements] = useState<ChuteAssignment[]>([]);
  const [place, setPlace] = useState('');
  const [nextPlace, setNextPlace] = useState(1);
  const [bib, setBib] = useState('');
  const [search, setSearch] = useState('');
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [scannerMode, setScannerMode] = useState(false);
  const [lastScanned, setLastScanned] = useState<{place: number, bib: string, name: string} | null>(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  
  const bibInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const currentPlaceRef = useRef(place);
  useEffect(() => { currentPlaceRef.current = place; }, [place]);

  useEffect(() => {
    loadPlacements();

    const handleGlobalClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
        if (formRef.current?.contains(target) || tableRef.current?.contains(target) || sidebarRef.current?.contains(target)) return;
        resetTarget();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
        if (e.key === 'Delete') {
            const pNum = parseInt(currentPlaceRef.current);
            if (pNum > 0) handleDelete(pNum);
        }
    };

    window.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('mousedown', handleGlobalClick);
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [race.id, nextPlace]);

  useEffect(() => {
    if (!race.start_time) {
        setElapsed('00:00:00');
        return;
    }
    const timer = setInterval(() => {
        const start = new Date(race.start_time!).getTime();
        const diff = new Date().getTime() - start;
        if (diff < 0) return;
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setElapsed(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [race.start_time]);

  const loadPlacements = () => {
    TimingService.ListPlacements(race.id).then(data => {
        const sorted = data || [];
        setPlacements(sorted);
        const next = (sorted.length > 0) ? Math.max(...sorted.map(d => d.place)) + 1 : 1;
        setNextPlace(next);
        setPlace(prev => (!prev || parseInt(prev) >= next - 1) ? next.toString() : prev);
    }).catch(console.error);
  };

  const resetTarget = () => setPlace(nextPlace.toString());

  const handleAssign = async (p: number, b: string, skipConfirm = false) => {
    if (!b || !p) return;
    const unofficialTime = race.start_time ? elapsed : "";
    TimingService.AssignBibToPlaceWithTime(race.id, p, b, unofficialTime)
      .then(() => {
        const part = participants.find(reg => reg.bib_number === b);
        setLastScanned({ place: p, bib: b, name: part ? `${part.first_name} ${part.last_name}` : "Unknown Runner" });
        loadPlacements();
        setBib('');
        bibInputRef.current?.focus();
      })
      .catch(console.error);
  };

  const handleShift = (p: number, delta: number) => {
    if (window.confirm(`Shift sequence from ${p} onwards?`)) {
        TimingService.ShiftPlacements(race.id, p, delta).then(loadPlacements).catch(console.error);
    }
  };

  const handleDelete = (p: number) => {
    if (window.confirm(`Delete placement ${p}?`)) {
        TimingService.DeletePlacement(race.id, p).then(loadPlacements).catch(console.error);
    }
  };

  const unassigned = participants.filter(p => !placements.some(pl => pl.bib_number === p.bib_number));
  const filteredUnassigned = unassigned.filter(p => 
    p.first_name.toLowerCase().includes(search.toLowerCase()) || 
    p.last_name.toLowerCase().includes(search.toLowerCase()) ||
    p.bib_number.includes(search)
  );

  const maxExisting = placements.length > 0 ? Math.max(...placements.map(p => p.place)) : 0;
  const tableRows = [];
  for (let i = 1; i <= maxExisting; i++) {
    tableRows.push({ index: i, data: placements.find(item => item.place === i) });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex-between" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="flex-row">
            <h2>Placements</h2>
            {race.start_time && (
                <div className="badge" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', padding: '8px 16px', fontSize: '1.1rem', fontFamily: 'monospace', color: 'var(--success)' }}>
                    CLOCK: {elapsed}
                </div>
            )}
        </div>
        <div className="flex-row">
            <button onClick={() => setScannerMode(!scannerMode)} style={{ backgroundColor: scannerMode ? 'var(--danger)' : 'var(--accent)' }}>
                {scannerMode ? '🛑 Stop Scanner' : '📷 Scanner Mode'}
            </button>
            <button onClick={() => setShowUnassigned(!showUnassigned)} style={{ backgroundColor: '#444' }}>
                {showUnassigned ? 'Hide Sidebar' : 'Show Unassigned'}
            </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-lg)', alignItems: 'flex-start', flexGrow: 1, minHeight: 0 }}>
        <div style={{ flex: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            {!scannerMode && (
                <div ref={formRef} className="card" style={{ border: '1px solid var(--accent)', backgroundColor: 'rgba(0, 123, 255, 0.03)', marginBottom: 'var(--space-md)' }}>
                    <form onSubmit={(e) => { e.preventDefault(); handleAssign(parseInt(place), bib); }} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
                        <div style={{ width: '120px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>TARGET PLACE</label>
                            <div className="flex-row" style={{ gap: '4px' }}>
                                <input type="number" value={place} onChange={e => setPlace(e.target.value)} style={{ width: '100%' }} />
                                {parseInt(place) !== nextPlace && ( <button type="button" onClick={resetTarget} style={{ padding: '8px', minWidth: '40px', backgroundColor: '#444' }}>↺</button> )}
                            </div>
                        </div>
                        <div style={{ width: '160px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>BIB NUMBER</label>
                            <input ref={bibInputRef} autoFocus value={bib} onChange={e => setBib(e.target.value)} placeholder="Bib" style={{ width: '100%' }} />
                        </div>
                        <button type="submit">Assign Bib</button>
                        <button type="button" onClick={() => handleAssign(parseInt(place), "?", true)} style={{ backgroundColor: '#a63' }}>Placeholder</button>
                    </form>
                </div>
            )}

            {scannerMode && (
                <div className="card" style={{ border: '4px solid var(--success)', textAlign: 'center', padding: 'var(--space-xl)', backgroundColor: 'rgba(76, 175, 80, 0.05)', marginBottom: 'var(--space-md)' }}>
                    <h1 className="text-success" style={{ fontSize: '2.5rem', marginBottom: 'var(--space-sm)' }}>SCANNER ACTIVE</h1>
                    <p style={{ fontSize: '1.2rem', opacity: 0.8 }}>Targeting Place #{place}</p>
                    {lastScanned && (
                        <div style={{ marginTop: '20px' }}>
                            <div style={{ fontSize: '3.5rem', fontWeight: 900 }}>#{lastScanned.place}: {lastScanned.bib}</div>
                            <div style={{ fontSize: '1.5rem', color: 'var(--text-dim)' }}>{lastScanned.name}</div>
                        </div>
                    )}
                    <input ref={bibInputRef} value={bib} onChange={e => setBib(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAssign(parseInt(place), bib)} style={{ opacity: 0, height: 0, position: 'absolute' }} autoFocus />
                </div>
            )}

            <div className="table-card" style={{ flexGrow: 1, overflowY: 'auto' }}>
                <table ref={tableRef} style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ paddingLeft: 'var(--space-lg)' }}>Place</th>
                            <th>Bib #</th>
                            <th>Participant</th>
                            <th>Time</th>
                            <th style={{ textAlign: 'right', paddingRight: 'var(--space-lg)' }}>Tools</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableRows.map((row) => {
                            const p = row.data;
                            const part = p ? participants.find(reg => reg.bib_number === p.bib_number) : null;
                            const isTargeted = place === row.index.toString();
                            if (!p) {
                                return (
                                    <tr key={row.index} onClick={() => setPlace(row.index.toString())} style={{ backgroundColor: isTargeted ? 'rgba(244, 67, 54, 0.1)' : 'transparent', cursor: 'pointer' }}>
                                        <td style={{ paddingLeft: 'var(--space-lg)', color: 'var(--danger)', fontWeight: 700 }}>{isTargeted ? '👉 ' : ''}{row.index}</td>
                                        <td colSpan={3} style={{ color: 'var(--danger)' }}><em>--- EMPTY GAP ---</em></td>
                                        <td style={{ textAlign: 'right', paddingRight: 'var(--space-lg)' }}>
                                            <button onClick={(e) => { e.stopPropagation(); handleAssign(row.index, "?", true); }} style={{ padding: '4px 12px', fontSize: '0.75rem', backgroundColor: 'var(--danger)' }}>Fill Gap</button>
                                        </td>
                                    </tr>
                                );
                            }
                            return (
                                <tr key={p.place} onClick={() => setPlace(p.place.toString())} style={{ backgroundColor: isTargeted ? 'rgba(0, 123, 255, 0.1)' : 'transparent', cursor: 'pointer' }}>
                                    <td style={{ paddingLeft: 'var(--space-lg)' }}>{isTargeted ? '👉 ' : ''}{p.place}</td>
                                    <td><strong>{p.bib_number}</strong></td>
                                    <td>{part ? `${part.first_name} ${part.last_name}` : (p.bib_number === "?" ? "Placeholder" : "Unregistered")}</td>
                                    <td style={{ fontFamily: 'monospace', color: 'var(--text-dim)' }}>{p.unofficial_time || '--'}</td>
                                    <td style={{ textAlign: 'right', paddingRight: 'var(--space-lg)' }}>
                                        <div className="flex-row" style={{ justifyContent: 'flex-end', gap: '4px' }}>
                                            <button onClick={(e) => { e.stopPropagation(); handleShift(p.place, 1); }} style={{ backgroundColor: '#333', padding: '4px 10px' }}>↓</button>
                                            <button onClick={(e) => { e.stopPropagation(); handleShift(p.place, -1); }} style={{ backgroundColor: '#333', padding: '4px 10px' }}>↑</button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(p.place); }} style={{ backgroundColor: 'transparent', color: 'var(--danger)', padding: '4px 10px' }}>Del</button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>

        {showUnassigned && (
            <div ref={sidebarRef} style={{ width: '320px', height: '100%', display: 'flex', flexDirection: 'column' }} className="card">
                <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: 'var(--space-md)' }}>Remaining</h3>
                <input placeholder="Search runners..." value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 'var(--space-md)' }} />
                <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                    {filteredUnassigned.map(p => (
                        <div key={p.id} onClick={() => { setBib(p.bib_number); bibInputRef.current?.focus(); }} style={{ padding: '10px', borderBottom: '1px solid #222', cursor: 'pointer' }}>
                            <strong>{p.bib_number || '---'}</strong>: {p.first_name} {p.last_name}
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
