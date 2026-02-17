import React, { useState, useEffect } from 'react';
import { TimingService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { Participant, Event as RaceEvent, ChuteAssignment } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface PlacementEntryProps {
  raceID: number;
  participants: Participant[];
  events: RaceEvent[];
}

export const PlacementEntry: React.FC<PlacementEntryProps> = ({ raceID, participants, events }) => {
  const [placements, setPlacements] = useState<ChuteAssignment[]>([]);
  const [place, setPlace] = useState('1');
  const [bib, setBib] = useState('');
  const [search, setSearch] = useState('');
  const [showUnassigned, setShowUnassigned] = useState(false);

  useEffect(() => {
    loadPlacements();
  }, [raceID]);

  const loadPlacements = () => {
    TimingService.ListPlacements(raceID).then(data => {
        setPlacements(data || []);
        const nextPlace = (data?.length > 0) ? Math.max(...data.map(d => d.place)) + 1 : 1;
        setPlace(nextPlace.toString());
    }).catch(console.error);
  };

  const handleAssign = async (p: number, b: string, skipConfirm = false) => {
    if (!b || !p) return;

    if (!skipConfirm && b !== "?") {
        const existingPlace = await TimingService.GetBibAssignment(raceID, b);
        if (existingPlace > 0 && existingPlace !== p) {
            if (!window.confirm(`Bib ${b} is already assigned to place ${existingPlace}. Move it to place ${p}?`)) {
                return;
            }
        }
    }

    TimingService.AssignBibToPlace(raceID, p, b)
      .then(() => {
        loadPlacements();
        setBib('');
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Placements</h2>
        <button onClick={() => setShowUnassigned(!showUnassigned)}>
            {showUnassigned ? 'Hide Unassigned' : 'Show Unassigned Runners'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <div style={{ flex: 3 }}>
            <div className="card" style={{ marginBottom: '20px', border: '1px solid var(--accent)' }}>
                <form onSubmit={(e) => { e.preventDefault(); handleAssign(parseInt(place), bib); }} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
                    <div>
                        <label>Place:</label><br/>
                        <input type="number" value={place} onChange={e => setPlace(e.target.value)} style={{ width: '70px' }} />
                    </div>
                    <div>
                        <label>Bib #:</label><br/>
                        <input autoFocus value={bib} onChange={e => setBib(e.target.value)} style={{ width: '120px' }} placeholder="Bib" />
                    </div>
                    <button type="submit">Assign</button>
                    <button type="button" onClick={() => handleAssign(parseInt(place), "?", true)} style={{ backgroundColor: 'var(--warning)', color: 'black' }}>Placeholder</button>
                </form>
            </div>

            <div className="card">
                <table>
                    <thead><tr><th>Place</th><th>Bib</th><th>Participant</th><th style={{ textAlign: 'right' }}>Tools</th></tr></thead>
                    <tbody>
                        {tableRows.map((row) => {
                            const p = row.data;
                            const part = p ? participants.find(reg => reg.bib_number === p.bib_number) : null;
                            if (!p) {
                                return (
                                    <tr key={row.index} style={{ backgroundColor: '#322' }}>
                                        <td>{row.index}</td><td colSpan={2} style={{ color: 'var(--danger)' }}>GAP</td>
                                        <td style={{ textAlign: 'right' }}><button onClick={() => handleAssign(row.index, "?", true)} style={{ padding: '2px 5px' }}>Fill</button></td>
                                    </tr>
                                );
                            }
                            return (
                                <tr key={p.place}>
                                    <td>{p.place}</td>
                                    <td>
                                        <input defaultValue={p.bib_number} onBlur={(e) => { if (e.target.value !== p.bib_number) handleAssign(p.place, e.target.value); }} style={{ width: '60px' }} />
                                    </td>
                                    <td>{p.bib_number === "?" ? "Placeholder" : (part ? `${part.first_name} ${part.last_name}` : "Unknown")}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button onClick={() => handleShift(p.place, 1)} style={{ backgroundColor: '#444', marginRight: '2px' }}>↓</button>
                                        <button onClick={() => handleShift(p.place, -1)} style={{ backgroundColor: '#444', marginRight: '2px' }}>↑</button>
                                        <button onClick={() => handleDelete(p.place)} style={{ backgroundColor: 'var(--danger)' }}>×</button>
                                    </td>
                                </tr>
                            );
                        })}
                        <tr style={{ backgroundColor: '#ffffff05' }}>
                            <td><input type="number" value={place} onChange={e => setPlace(e.target.value)} style={{ width: '60px' }} /></td>
                            <td><input value={bib} onChange={e => setBib(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAssign(parseInt(place), bib)} style={{ width: '60px' }} /></td>
                            <td colSpan={2}><button onClick={() => handleAssign(parseInt(place), bib)}>Add Row</button></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        {showUnassigned && (
            <div style={{ flex: 1, position: 'sticky', top: '20px' }} className="card">
                <h3>Unassigned</h3>
                <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', marginBottom: '10px' }} />
                <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
                    {filteredUnassigned.map(p => (
                        <div key={p.id} onClick={() => setBib(p.bib_number)} style={{ padding: '8px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
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
