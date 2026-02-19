import React, { useState, useEffect } from 'react';
import { EventService, RunSignUpService, RaceService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { Event as RaceEvent, RSUEvent } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface EventManagementProps {
  raceID: number;
  events: RaceEvent[];
  onRefresh: () => void;
}

export const EventManagement: React.FC<EventManagementProps> = ({ raceID, events, onRefresh }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingID, setEditingID] = useState<number | null>(null);
  const [rsuEvents, setRsuEvents] = useState<RSUEvent[]>([]);
  const [form, setForm] = useState({ name: '', distance: '5.0', rsuEventID: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    loadRSUEvents();
  }, [raceID]);

  const loadRSUEvents = async () => {
    try {
        setError('');
        const race = await RaceService.GetByID(raceID);

        if (race?.rsu?.race_id && race.rsu.api_key && race.rsu.api_secret) {
            const list = await RunSignUpService.GetRSUEvents(race.rsu.race_id, race.rsu.api_key, race.rsu.api_secret);
            setRsuEvents(list || []);
        } else {
            setError('RunSignUp credentials not configured for this race.');
        }
    } catch (e: any) { 
        setError(e.toString());
        console.error("Failed to load RSU events:", e); 
    }
  };

  const resetForm = () => {
    setForm({ name: '', distance: '5.0', rsuEventID: '' });
    setEditingID(null);
  };

  const handleEdit = (ev: RaceEvent) => {
    setEditingID(ev.id);
    setForm({ 
        name: ev.name, 
        distance: ev.distance_km.toString(),
        rsuEventID: ev.runsignup_event_id || ''
    });
    setIsAdding(true);
  };

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Delete event "${name}"?`)) {
        EventService.DeleteEvent(id).then(onRefresh).catch(err => alert("Cannot delete: " + err));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ev = new RaceEvent({
        id: editingID || 0,
        race_id: raceID,
        name: form.name,
        distance_km: parseFloat(form.distance) || 0,
        runsignup_event_id: form.rsuEventID
    });

    const action = editingID ? EventService.UpdateEvent(ev) : EventService.CreateEvent(ev);
    action.then(() => {
        setIsAdding(false);
        resetForm();
        onRefresh();
    }).catch(console.error);
  };

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 'var(--space-lg)' }}>
        <h2>Manage Events</h2>
        <div className="flex-row">
            {error && <span className="text-warning" style={{ fontSize: '0.8em' }}>⚠️ {error}</span>}
            <button onClick={() => { if(isAdding) resetForm(); setIsAdding(!isAdding); }}>
                {isAdding ? 'Cancel' : '+ Add Event'}
            </button>
        </div>
      </div>

      {isAdding && (
        <div className="card" style={{ marginBottom: 'var(--space-lg)', border: '1px solid var(--accent)' }}>
            <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                {editingID ? 'Edit Event' : 'New Event'}
            </h3>
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>EVENT NAME</label>
                    <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required placeholder="e.g. 5K Run" style={{ width: '100%' }} />
                </div>
                <div style={{ width: '120px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>DISTANCE (KM)</label>
                    <input type="number" step="0.01" value={form.distance} onChange={e => setForm({...form, distance: e.target.value})} required style={{ width: '100%' }} />
                </div>
                <div style={{ flex: 1.5 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>RUNSIGNUP MAPPING</label>
                    <select value={form.rsuEventID} onChange={e => setForm({...form, rsuEventID: e.target.value})} style={{ width: '100%' }}>
                        <option value="">-- No Mapping --</option>
                        {rsuEvents.map(re => (
                            <option key={re.event_id} value={re.event_id.toString()}>{re.name} ({re.start_time})</option>
                        ))}
                    </select>
                </div>
                <button type="submit" style={{ minWidth: '140px', padding: '12px' }}>{editingID ? 'Save' : 'Create'}</button>
            </form>
        </div>
      )}

      <div className="table-card">
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
                <tr>
                    <th style={{ paddingLeft: 'var(--space-lg)' }}>Name</th>
                    <th>Distance</th>
                    <th>RunSignUp ID</th>
                    <th style={{ textAlign: 'right', paddingRight: 'var(--space-lg)' }}>Actions</th>
                </tr>
            </thead>
            <tbody>
                {events.map(ev => (
                    <tr key={ev.id}>
                        <td style={{ paddingLeft: 'var(--space-lg)' }}><strong>{ev.name}</strong></td>
                        <td>{ev.distance_km} KM</td>
                        <td>
                            {ev.runsignup_event_id ? (
                                <span className="badge" style={{ backgroundColor: '#ffffff10', color: 'var(--success)', border: '1px solid var(--success)' }}>🔗 {ev.runsignup_event_id}</span>
                            ) : (
                                <span className="text-dim">None</span>
                            )}
                        </td>
                        <td style={{ textAlign: 'right', paddingRight: 'var(--space-lg)' }}>
                            <button onClick={() => handleEdit(ev)} style={{ backgroundColor: 'transparent', color: 'var(--text-dim)', padding: '4px 8px' }}>Edit</button>
                            <button onClick={() => handleDelete(ev.id, ev.name)} style={{ backgroundColor: 'transparent', color: 'var(--danger)', padding: '4px 8px' }}>Del</button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
        {events.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                No events configured for this race.
            </div>
        )}
      </div>
    </div>
  );
};
