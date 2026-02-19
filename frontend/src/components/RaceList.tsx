import React, { useState } from 'react';
import { Race } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface RaceListProps {
  races: Race[];
  onSelectRace: (r: Race) => void;
  onRefresh: () => void;
  onCreateRace: () => void;
}

export const RaceList: React.FC<RaceListProps> = ({ races, onSelectRace, onCreateRace }) => {
  const [sortKey, setSortKey] = useState<'name' | 'date'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedRaces = [...races].sort((a, b) => {
    let result = 0;
    if (sortKey === 'name') result = a.name.localeCompare(b.name);
    else result = new Date(a.date).getTime() - new Date(b.date).getTime();
    return sortDir === 'asc' ? result : -result;
  });

  const toggleSort = (key: 'name' | 'date') => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Available Races</h2>
        <button onClick={onCreateRace} style={{ backgroundColor: 'var(--success)' }}>+ Create New Race</button>
      </div>

      <div className="card">
        <table style={{ width: '100%', textAlign: 'left' }}>
          <thead>
            <tr>
              <th onClick={() => toggleSort('name')} style={{ cursor: 'pointer' }}>
                Race Name {sortKey === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => toggleSort('date')} style={{ cursor: 'pointer' }}>
                Date {sortKey === 'date' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedRaces.map(r => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong></td>
                <td>{new Date(r.date).toLocaleDateString()}</td>
                <td style={{ textAlign: 'right' }}>
                  <button onClick={() => onSelectRace(r)}>Open Dashboard</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
