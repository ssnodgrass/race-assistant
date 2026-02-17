import React, { useState, useEffect, useRef } from 'react';
import { TimingService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { Participant, Event as RaceEvent, ChuteAssignment } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface PlacementEntryProps {
  raceID: number;
  participants: Participant[];
  events: RaceEvent[];
  onBack?: () => void;
}

export const PlacementEntry: React.FC<PlacementEntryProps> = ({ raceID, participants, events, onBack }) => {
  const [placements, setPlacements] = useState<ChuteAssignment[]>([]);
  const [place, setPlace] = useState('');
  const [nextPlace, setNextPlace] = useState(1);
  const [bib, setBib] = useState('');
  const [search, setSearch] = useState('');
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [scannerMode, setScannerMode] = useState(false);
  const [lastScanned, setLastScanned] = useState<{place: number, bib: string, name: string} | null>(null);
  
  const bibInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPlacements();

    const handleGlobalClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT') return;

        const isInsideInteractive = 
            formRef.current?.contains(target) || 
            tableRef.current?.contains(target) || 
            sidebarRef.current?.contains(target);

        if (!isInsideInteractive) resetTarget();
    };

    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, [raceID, nextPlace]);

  // Maintain focus in scanner mode
  useEffect(() => {
    if (scannerMode) {
        const interval = setInterval(() => {
            if (document.activeElement?.tagName !== 'INPUT') {
                bibInputRef.current?.focus();
            }
        }, 500);
        return () => clearInterval(interval);
    }
  }, [scannerMode]);

  const loadPlacements = () => {
    TimingService.ListPlacements(raceID).then(data => {
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

    if (!skipConfirm && !scannerMode) {
        if (b !== "?") {
            const existingPlace = await TimingService.GetBibAssignment(raceID, b);
            if (existingPlace > 0 && existingPlace !== p) {
                if (!window.confirm(`Bib ${b} is already assigned to place ${existingPlace}. Move it to place ${p}?`)) return;
            }
        }
        const existingAtPlace = placements.find(pl => pl.place === p);
        if (existingAtPlace && existingAtPlace.bib_number !== b && existingAtPlace.bib_number !== "?") {
            if (!window.confirm(`Place ${p} is already occupied by bib ${existingAtPlace.bib_number}. Overwrite with bib ${b}?`)) return;
        }
    }

    TimingService.AssignBibToPlace(raceID, p, b)
      .then(() => {
        const part = participants.find(reg => reg.bib_number === b);
        setLastScanned({ 
            place: p, 
            bib: b, 
            name: part ? `${part.first_name} ${part.last_name}` : "Unknown Runner" 
        });
        loadPlacements();
        setBib('');
        bibInputRef.current?.focus();
      })
      .catch(console.error);
  };

  const handleShift = (p: number, delta: number) => {
    const action = delta > 0 ? "DOWN" : "UP";
    if (window.confirm(`Shift everyone from place ${p} onwards ${action} by 1?`)) {
        TimingService.ShiftPlacements(raceID, p, delta).then(loadPlacements).catch(console.error);
    }
  };

  const handleDelete = (p: number) => {
    if (window.confirm(`Delete placement ${p}? This will leave a gap.`)) {
        TimingService.DeletePlacement(raceID, p).then(loadPlacements).catch(console.error);
    }
  };

  const unassigned = participants.filter(p => !placements.some(pl => pl.bib_number === p.bib_number));
  const filteredUnassigned = unassigned.filter(p => 
    p.first_name.toLowerCase().includes(search.toLowerCase()) || 
    p.last_name.toLowerCase().includes(search.toLowerCase()) ||
    p.bib_number.includes(search)
  );

  const maxExisting = placements.length > 0 ? Math.max(...placements.map(p => p.place)) : 0;
  interface TableRow { index: number; data: ChuteAssignment | undefined; }
  const tableRows: TableRow[] = [];
  for (let i = 1; i <= maxExisting; i++) {
    const p = placements.find(item => item.place === i);
    tableRows.push({ index: i, data: p });
  }

  const selectFromLookup = (participantBib: string) => {
    setBib(participantBib);
    setTimeout(() => bibInputRef.current?.focus(), 10);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: '100%', padding: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Placements</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
            <button 
                onClick={() => setScannerMode(!scannerMode)} 
                style={{ backgroundColor: scannerMode ? 'var(--success)' : '#444' }}
            >
                {scannerMode ? '🛑 Stop Scanner' : '📷 Scanner Mode'}
            </button>
            <button onClick={() => setShowUnassigned(!showUnassigned)} style={{ backgroundColor: showUnassigned ? 'var(--accent)' : '#444' }}>
                {showUnassigned ? 'Hide Unassigned' : 'Show Unassigned'}
            </button>
            {onBack && <button onClick={onBack} style={{ backgroundColor: '#555' }}>Back</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexGrow: 1 }}>
        <div style={{ flex: 3, height: '100%' }}>
            
            {scannerMode ? (
                <div className="card" style={{ border: '4px solid var(--success)', textAlign: 'center', padding: '40px', marginBottom: '20px' }}>
                    <h1 style={{ color: 'var(--success)', fontSize: '3em', marginBottom: '10px' }}>SCANNER ACTIVE</h1>
                    <p style={{ fontSize: '1.5em', marginBottom: '30px' }}>Scanning for Place #{place}</p>
                    
                    {lastScanned ? (
                        <div style={{ padding: '20px', backgroundColor: '#ffffff05', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <div style={{ color: 'var(--text-dim)', textTransform: 'uppercase', fontSize: '0.9em' }}>Last Scanned</div>
                            <div style={{ fontSize: '4em', fontWeight: 'bold' }}>#{lastScanned.place}: {lastScanned.bib}</div>
                            <div style={{ fontSize: '2em', color: 'var(--accent)' }}>{lastScanned.name}</div>
                        </div>
                    ) : (
                        <div style={{ padding: '40px', color: 'var(--text-dim)' }}>No bibs scanned yet.</div>
                    )}

                    <input 
                        ref={bibInputRef}
                        value={bib}
                        onChange={e => setBib(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAssign(parseInt(place), bib)}
                        style={{ opacity: 0, height: 0, position: 'absolute' }}
                        autoFocus
                    />
                </div>
            ) : (
                <div ref={formRef} className="card" style={{ marginBottom: '20px', border: '1px solid #007bff', padding: '20px' }}>
                    <form onSubmit={(e) => { e.preventDefault(); handleAssign(parseInt(place), bib); }} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
                        <div>
                            <label>Target Place:</label><br/>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <input type="number" value={place} onChange={e => setPlace(e.target.value)} style={{ fontSize: '1.2em', width: '70px' }} />
                                {parseInt(place) !== nextPlace && (
                                    <button type="button" title="Reset" onClick={resetTarget} style={{ padding: '4px 8px', backgroundColor: '#444', fontSize: '0.8em' }}>↺</button>
                                )}
                            </div>
                        </div>
                        <div>
                            <label>Bib Number:</label><br/>
                            <input ref={bibInputRef} autoFocus value={bib} onChange={e => setBib(e.target.value)} style={{ fontSize: '1.2em', width: '120px' }} placeholder="Bib" />
                        </div>
                        <button type="submit" style={{ padding: '8px 20px' }}>Assign Bib (Enter)</button>
                        <button type="button" onClick={() => handleAssign(parseInt(place), "?", true)} style={{ backgroundColor: '#a63' }}>Insert Placeholder</button>
                    </form>
                </div>
            )}

            <div className="card">
                <table ref={tableRef} style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #555' }}>
                            <th>Place</th><th>Bib #</th><th>Participant</th><th style={{ textAlign: 'right' }}>Tools</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableRows.map((row) => {
                            const p = row.data;
                            const part = p ? participants.find(reg => reg.bib_number === p.bib_number) : null;
                            const isTargeted = place === row.index.toString();
                            
                            if (!p) {
                                return (
                                    <tr key={row.index} onClick={(e) => { e.stopPropagation(); setPlace(row.index.toString()); }} style={{ backgroundColor: isTargeted ? '#442' : '#322', borderBottom: '1px solid #444', cursor: 'pointer' }}>
                                        <td style={{ padding: '8px 0', color: '#f88' }}>{isTargeted ? '👉 ' : ''}{row.index}</td>
                                        <td colSpan={2} style={{ color: '#f88' }}><em>--- EMPTY GAP ---</em></td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button onClick={(e) => { e.stopPropagation(); handleAssign(row.index, "?", true); }} style={{ padding: '2px 5px', fontSize: '0.7em' }}>Fill</button>
                                        </td>
                                    </tr>
                                );
                            }

                            return (
                                <tr key={p.place} onClick={(e) => { e.stopPropagation(); setPlace(p.place.toString()); }} style={{ borderBottom: '1px solid #444', backgroundColor: isTargeted ? '#2c3e50' : (p.bib_number === "?" ? "#333" : "transparent"), cursor: 'pointer' }}>
                                    <td style={{ padding: '8px 0' }}>{isTargeted ? '👉 ' : ''}{p.place}</td>
                                    <td>
                                        <input 
                                            key={`${p.place}-${p.bib_number}`}
                                            defaultValue={p.bib_number} 
                                            onClick={(e) => e.stopPropagation()}
                                            onBlur={(e) => { if (e.target.value && e.target.value !== p.bib_number) handleAssign(p.place, e.target.value); }} 
                                            style={{ width: '60px', color: p.bib_number === "?" ? "#f63" : "inherit" }}
                                        />
                                    </td>
                                    <td>{p.bib_number === "?" ? "Placeholder" : (part ? `${part.first_name} ${part.last_name}` : <span style={{color: '#f33'}}>Unregistered</span>)}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button onClick={(e) => { e.stopPropagation(); handleShift(p.place, 1); }} style={{ backgroundColor: '#444', marginRight: '2px' }}>↓</button>
                                        <button onClick={(e) => { e.stopPropagation(); handleShift(p.place, -1); }} style={{ backgroundColor: '#444', marginRight: '5px' }}>↑</button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(p.place); }} style={{ backgroundColor: '#a33' }}>Del</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>

        {showUnassigned && (
            <div ref={sidebarRef} style={{ flex: 1, position: 'sticky', top: '20px' }} className="card" onClick={e => e.stopPropagation()}>
                <h3>Remaining Runners</h3>
                <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px' }} />
                <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
                    {filteredUnassigned.map(p => (
                        <div key={p.id} tabIndex={0} onClick={(e) => { e.stopPropagation(); selectFromLookup(p.bib_number); }} onKeyDown={(e) => { if (e.key === 'Enter') handleAssign(parseInt(place), p.bib_number); }} style={{ padding: '8px', borderBottom: '1px solid #333', cursor: 'pointer' }} className="hover-row">
                            <strong>{p.bib_number}</strong>: {p.first_name}
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
