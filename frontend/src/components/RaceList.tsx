import React from 'react';
import { Race } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface RaceListProps {
  races: Race[];
  onSelectRace: (race: Race) => void;
  onRefresh: () => void;
  onCreateRace: () => void;
}

export const RaceList: React.FC<RaceListProps> = ({ races, onSelectRace, onRefresh, onCreateRace }) => {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Available Races</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={onCreateRace}>+ Create New Race</button>
            <button onClick={onRefresh} style={{ backgroundColor: '#444' }}>Refresh List</button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Race Name</th>
            <th>Date</th>
            <th style={{ textAlign: 'right' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {races.map(r => (
            <tr key={r.id}>
              <td><strong>{r.name}</strong></td>
              <td>{new Date(r.date).toLocaleDateString()}</td>
              <td style={{ textAlign: 'right' }}>
                <button onClick={() => onSelectRace(r)}>Open Dashboard</button>
              </td>
            </tr>
          ))}
          {races.length === 0 && (
            <tr>
              <td colSpan={3} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
                No races found in this database.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
