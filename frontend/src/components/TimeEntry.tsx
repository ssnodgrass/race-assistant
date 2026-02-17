import React, { useState, useEffect } from 'react';
import { TimingService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { TimingPulse } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface TimeEntryProps {
  raceID: number;
}

export const TimeEntry: React.FC<TimeEntryProps> = ({ raceID }) => {
  const [pulses, setPulses] = useState<TimingPulse[]>([]);
  const [place, setPlace] = useState('1');
  const [time, setTime] = useState('');

  useEffect(() => {
    loadPulses();
  }, [raceID]);

  const loadPulses = () => {
    TimingService.ListTimingPulses(raceID).then(data => {
        setPulses(data || []);
        const nextPlace = (data?.length > 0) ? Math.max(...data.map(d => d.place)) + 1 : 1;
        setPlace(nextPlace.toString());
    }).catch(console.error);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!time || !place) return;

    TimingService.AddTimingPulse(raceID, parseInt(place), time)
      .then(() => {
        loadPulses();
        setTime('');
      })
      .catch(console.error);
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Delete this time pulse?")) {
        TimingService.DeleteTimingPulse(id).then(loadPulses).catch(console.error);
    }
  };

  const handleUpdate = (p: TimingPulse, field: 'place' | 'raw_time', value: any) => {
    const updated = new TimingPulse({ ...p, [field]: field === 'place' ? parseInt(value) : value });
    TimingService.UpdateTimingPulse(updated).then(loadPulses).catch(console.error);
  };

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2>Recorded Times</h2>
      </div>

      <div className="card" style={{ marginBottom: '20px', border: '1px solid var(--success)' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
            <div>
                <label>Place:</label><br/>
                <input type="number" value={place} onChange={e => setPlace(e.target.value)} style={{ width: '80px' }} />
            </div>
            <div style={{ flex: 1 }}>
                <label>Time (MM:SS.hh):</label><br/>
                <input placeholder="e.g. 18:24.00" value={time} onChange={e => setTime(e.target.value)} style={{ width: '100%' }} autoFocus />
            </div>
            <button type="submit">Save</button>
        </form>
      </div>

      <div className="card">
            <table>
                <thead><tr><th>Place</th><th>Time</th><th>Actions</th></tr></thead>
                <tbody>
                    {pulses.map((p, idx) => (
                        <tr key={p.id}>
                            <td>
                                <input type="number" defaultValue={p.place} onBlur={(e) => handleUpdate(p, 'place', e.target.value)} style={{ width: '60px' }} />
                            </td>
                            <td>
                                <input defaultValue={p.raw_time} onBlur={(e) => handleUpdate(p, 'raw_time', e.target.value)} style={{ width: '120px', fontFamily: 'monospace' }} />
                            </td>
                            <td>
                                <button onClick={() => handleDelete(p.id)} style={{ backgroundColor: 'var(--danger)' }}>×</button>
                            </td>
                        </tr>
                    ))}
                    <tr style={{ backgroundColor: '#ffffff05' }}>
                        <td><input type="number" value={place} onChange={e => setPlace(e.target.value)} style={{ width: '60px' }} /></td>
                        <td><input value={time} onChange={e => setTime(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} style={{ width: '120px' }} /></td>
                        <td><button onClick={() => handleSubmit()}>Add Row</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
  );
};
