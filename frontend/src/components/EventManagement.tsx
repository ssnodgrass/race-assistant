import React, { useState, useEffect } from 'react';
import { EventService, RunSignUpService, RaceService, SettingsService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
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

  useEffect(() => {
    loadRSUEvents();
  }, [raceID]);

  const loadRSUEvents = async () => {
    try {
        const [race, apiKey, apiSecret] = await Promise.all([
            RaceService.GetByID(raceID),
            SettingsService.Get('rsu_api_key'),
            SettingsService.Get('rsu_api_secret')
        ]);

        if (race?.rsu?.race_id && apiKey && apiSecret) {
            const list = await RunSignUpService.GetRSUEvents(race.rsu.race_id, apiKey, apiSecret);
            setRsuEvents(list || []);
        }
    } catch (e) { console.error("Failed to load RSU events:", e); }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Manage Events</h2>
        <button onClick={() => { if(isAdding) resetForm(); setIsAdding(!isAdding); }}>
            {isAdding ? 'Cancel' : '+ Add Event'}
        </button>
      </div>

      {isAdding && (
        <div className="card" style={{ marginBottom: '20px', border: '1px solid var(--accent)' }}>
            <h3>{editingID ? 'Edit Event' : 'New Event'}</h3>
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
                <div>
                    <label>Event Name:</label><br/>
                    <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required placeholder="e.g. 5K Run" />
                </div>
                <div>
                    <label>Distance (KM):</label><br/>
                    <input type="number" step="0.01" value={form.distance} onChange={e => setForm({...form, distance: e.target.value})} required style={{ width: '80px' }} />
                </div>
                <div>
                    <label>RunSignUp Mapping:</label><br/>
                    <select value={form.rsuEventID} onChange={e => setForm({...form, rsuEventID: e.target.value})} style={{ minWidth: '200px' }}>
                        <option value="">-- No Mapping --</option>
                        {rsuEvents.map(re => (
                            <option key={re.event_id} value={re.event_id.toString()}>{re.name} ({re.start_time})</option>
                        ))}
                    </select>
                </div>
                <button type="submit">{editingID ? 'Save Changes' : 'Create Event'}</button>
            </form>
        </div>
      )}

      <div className="card">
        <table style={{ width: '100%', textAlign: 'left' }}>
            <thead>
                <tr><th>Name</th><th>Distance</th><th>RunSignUp ID</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
                {events.map(ev => (
                    <tr key={ev.id}>
                        <td><strong>{ev.name}</strong></td>
                        <td>{ev.distance_km} KM</td>
                        <td>
                            {ev.runsignup_event_id ? (
                                <span style={{ color: 'var(--success)' }}>🔗 {ev.runsignup_event_id}</span>
                            ) : (
                                <span style={{ color: 'var(--text-dim)' }}>None</span>
                            )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                            <button onClick={() => handleEdit(ev)} style={{ backgroundColor: '#444', marginRight: '5px' }}>Edit</button>
                            <button onClick={() => handleDelete(ev.id, ev.name)} style={{ backgroundColor: '#a33' }}>Del</button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
};
