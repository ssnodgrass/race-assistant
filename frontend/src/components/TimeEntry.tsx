import React, { useState, useEffect, useRef } from 'react';
import { TimingService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { TimingPulse, Event as RaceEvent } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface TimeEntryProps {
  raceID: number;
  events: RaceEvent[];
}

export const TimeEntry: React.FC<TimeEntryProps> = ({ raceID, events }) => {
  const [pulses, setPulses] = useState<TimingPulse[]>([]);
  const [selectedEventID, setSelectedEventID] = useState<number>(events[0]?.id || 0);
  const [targetPlace, setTargetPlace] = useState('');
  const [timeValue, setTimeValue] = useState('');
  const [editingID, setEditingID] = useState<number | null>(null);
  const [nextPlace, setNextPlace] = useState(1);

  const timeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (events.length > 0 && !events.some(ev => ev.id === selectedEventID)) {
      setSelectedEventID(events[0].id);
    }
  }, [events, selectedEventID]);

  useEffect(() => {
    if (selectedEventID > 0) {
      loadPulses();
    }
  }, [raceID, selectedEventID]);

  const loadPulses = () => {
    if (!selectedEventID) {
      setPulses([]);
      setNextPlace(1);
      return;
    }
    TimingService.ListTimingPulsesByEvent(raceID, selectedEventID).then(data => {
        const sorted = [...(data || [])].sort((a, b) => a.place - b.place);
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
            const updated = new TimingPulse({ ...pulse, event_id: selectedEventID, raw_time: timeValue, place: parseInt(targetPlace) });
            TimingService.UpdateTimingPulse(updated).then(() => {
                loadPulses();
                resetForm();
            }).catch(console.error);
        }
    } else {
        TimingService.AddTimingPulseForEvent(raceID, selectedEventID, parseInt(targetPlace), timeValue)
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

  const handleDeleteAll = () => {
    if (!selectedEventID) return;
    if (window.confirm("Delete all recorded times for the selected event?")) {
      TimingService.DeleteAllTimingPulses(raceID, selectedEventID).then(() => {
        setEditingID(null);
        setTimeValue('');
        loadPulses();
      }).catch(console.error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex-between" style={{ marginBottom: 'var(--space-lg)' }}>
        <h2>Manual Time Entry</h2>
        <div className="flex-row">
          <div style={{ minWidth: '220px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, fontSize: '0.75em', color: 'var(--text-dim)' }}>EVENT</label>
            <select value={selectedEventID} onChange={e => setSelectedEventID(Number(e.target.value))}>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>
          {editingID && <button onClick={resetForm} style={{ backgroundColor: '#444' }}>Cancel Editing</button>}
          <button onClick={handleDeleteAll} style={{ backgroundColor: 'var(--danger)' }}>Delete All Times</button>
        </div>
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
