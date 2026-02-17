import React, { useState } from 'react';
import { EventService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { Event as RaceEvent } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface EventManagementProps {
  raceID: number;
  events: RaceEvent[];
  onRefresh: () => void;
}

export const EventManagement: React.FC<EventManagementProps> = ({ raceID, events, onRefresh }) => {
  const [name, setName] = useState('');
  const [distance, setDistance] = useState('5.0');
  const [editingID, setEditingID] = useState<number | null>(null);

  const handleAddOrUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const ev = new RaceEvent({
      id: editingID || 0,
      race_id: raceID,
      name,
      distance_km: parseFloat(distance)
    });

    const action = editingID ? EventService.UpdateEvent(ev) : EventService.CreateEvent(ev);

    action.then(() => {
        setName('');
        setDistance('5.0');
        setEditingID(null);
        onRefresh();
      })
      .catch(console.error);
  };

  const handleEdit = (ev: RaceEvent) => {
    setEditingID(ev.id);
    setName(ev.name);
    setDistance(ev.distance_km.toString());
  };

  const handleDelete = (ev: RaceEvent) => {
    if (window.confirm(`Are you sure you want to delete ${ev.name}?`)) {
        EventService.DeleteEvent(ev.id)
            .then(onRefresh)
            .catch(err => alert(err));
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2>Manage Events</h2>
      </div>
      <div className="card" style={{ marginBottom: '20px', border: editingID ? '1px solid var(--accent)' : 'none' }}>
        <h3>{editingID ? 'Edit Event' : 'Add New Event'}</h3>
        <form onSubmit={handleAddOrUpdate} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label>Event Name (e.g. 5K Run):</label><br/>
            <input style={{ width: '100%' }} placeholder="e.g. 5K Run" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div style={{ flex: 1 }}>
            <label>Distance (Kilometers):</label><br/>
            <input type="number" step="0.001" value={distance} onChange={e => setDistance(e.target.value)} required style={{ width: '100%' }} />
          </div>
          <button type="submit">{editingID ? 'Update' : 'Add Event'}</button>
          {editingID && <button type="button" onClick={() => { setEditingID(null); setName(''); setDistance('5.0'); }} style={{ backgroundColor: '#444' }}>Cancel</button>}
        </form>
      </div>

      <div className="card">
        <h3>Current Events</h3>
        <table>
            <thead><tr><th>Event Name</th><th>Distance (km)</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
                {events.map(ev => (
                    <tr key={ev.id}>
                        <td><strong>{ev.name}</strong></td>
                        <td>{ev.distance_km} km</td>
                        <td style={{ textAlign: 'right' }}>
                            <button onClick={() => handleEdit(ev)} style={{ padding: '2px 8px', marginRight: '5px', backgroundColor: '#444' }}>Edit</button>
                            <button onClick={() => handleDelete(ev)} style={{ padding: '2px 8px', backgroundColor: 'var(--danger)' }}>Delete</button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
        {events.length === 0 && <p style={{ textAlign: 'center', padding: '20px' }}>No events added yet.</p>}
      </div>
    </div>
  );
};
