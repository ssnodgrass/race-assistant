import React, { useState, useEffect, useRef } from 'react';
import { TimingService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { TimingPulse } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface TimeEntryProps {
  raceID: number;
}

export const TimeEntry: React.FC<TimeEntryProps> = ({ raceID }) => {
  const [pulses, setPulses] = useState<TimingPulse[]>([]);
  const [targetPlace, setTargetPlace] = useState('');
  const [timeValue, setTimeValue] = useState('');
  const [editingID, setEditingID] = useState<number | null>(null);
  const [nextPlace, setNextPlace] = useState(1);

  const timeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPulses();
  }, [raceID]);

  const loadPulses = () => {
    TimingService.ListTimingPulses(raceID).then(data => {
        const sorted = data || [];
        setPulses(sorted);
        const next = (sorted.length > 0) ? Math.max(...sorted.map(d => d.place)) + 1 : 1;
        setNextPlace(next);
        if (!editingID) {
            setTargetPlace(next.toString());
        }
    }).catch(console.error);
  };

  const handleSelect = (p: TimingPulse) => {
    setEditingID(p.id);
    setTargetPlace(p.place.toString());
    setTimeValue(p.raw_time);
    timeInputRef.current?.focus();
  };

  const resetForm = () => {
    setEditingID(null);
    setTargetPlace(nextPlace.toString());
    setTimeValue('');
    timeInputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!timeValue || !targetPlace) return;

    if (editingID) {
        const pulse = pulses.find(p => p.id === editingID);
        if (pulse) {
            const updated = new TimingPulse({ ...pulse, raw_time: timeValue, place: parseInt(targetPlace) });
            TimingService.UpdateTimingPulse(updated).then(() => {
                loadPulses();
                resetForm();
            }).catch(console.error);
        }
    } else {
        TimingService.AddTimingPulse(raceID, parseInt(targetPlace), timeValue)
          .then(() => {
            loadPulses();
            setTimeValue('');
          })
          .catch(console.error);
    }
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Delete this recorded time?")) {
        TimingService.DeleteTimingPulse(id).then(() => {
            loadPulses();
            if (editingID === id) resetForm();
        }).catch(console.error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex-between" style={{ marginBottom: 'var(--space-lg)' }}>
        <h2>Manual Time Entry</h2>
        {editingID && <button onClick={resetForm} style={{ backgroundColor: '#444' }}>Cancel Editing</button>}
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-lg)', border: '1px solid var(--accent)', backgroundColor: 'rgba(0, 123, 255, 0.03)' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
            <div style={{ width: '120px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>SEQUENCE #</label>
                <input type="number" value={targetPlace} onChange={e => setTargetPlace(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>TIME (HH:MM:SS.ms)</label>
                <input 
                    ref={timeInputRef}
                    placeholder="e.g. 00:18:24.000" 
                    value={timeValue} 
                    onChange={e => setTimeValue(e.target.value)} 
                    style={{ width: '100%', fontSize: '1.2rem', fontFamily: 'monospace' }} 
                    autoFocus 
                />
            </div>
            <button type="submit" style={{ padding: '12px 40px' }}>
                {editingID ? 'UPDATE TIME' : 'RECORD TIME'}
            </button>
        </form>
      </div>

      <div className="table-card" style={{ flexGrow: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        <th style={{ paddingLeft: 'var(--space-lg)', width: '140px' }}>Sequence</th>
                        <th>Recorded Time Value</th>
                        <th style={{ textAlign: 'right', paddingRight: 'var(--space-lg)' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {[...pulses].sort((a,b) => b.place - a.place).map((p) => (
                        <tr 
                            key={p.id} 
                            onClick={() => handleSelect(p)} 
                            style={{ 
                                cursor: 'pointer', 
                                backgroundColor: editingID === p.id ? 'rgba(0, 123, 255, 0.1)' : 'transparent' 
                            }}
                        >
                            <td style={{ paddingLeft: 'var(--space-lg)' }}>
                                <strong style={{ opacity: 0.6 }}>#{p.place}</strong>
                            </td>
                            <td>
                                <span style={{ fontFamily: 'monospace', fontSize: '1.2rem', color: 'var(--accent)', fontWeight: 700 }}>
                                    {p.raw_time}
                                </span>
                            </td>
                            <td style={{ textAlign: 'right', paddingRight: 'var(--space-lg)' }}>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} 
                                    style={{ backgroundColor: 'transparent', color: 'var(--danger)', padding: '4px 8px' }}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                    {pulses.length === 0 && (
                        <tr>
                            <td colSpan={3} style={{ textAlign: 'center', padding: '60px', color: 'var(--text-dim)' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '10px' }}>⏱️</div>
                                No manual times recorded yet.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
  );
};
