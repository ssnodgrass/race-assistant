import React, { useState, useEffect, useRef } from 'react';
import { TimingService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { TimingPulse, Event as RaceEvent } from '../../bindings/github.com/ssnodgrass/race-assistant/models';
import { formatStoredElapsedHundredths } from '../utils/companionClock';

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
  const editingIDRef = useRef<number | null>(null);
  const formDirtyRef = useRef(false);
  const pulseLoadInFlight = useRef(false);

  useEffect(() => {
    if (events.length > 0 && selectedEventID !== 0 && !events.some(ev => ev.id === selectedEventID)) {
      setSelectedEventID(events[0].id);
    }
  }, [events, selectedEventID]);

  useEffect(() => {
    editingIDRef.current = null;
    formDirtyRef.current = false;
    setEditingID(null);
    setTimeValue('');
    loadPulses();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadPulses();
    }, 1000);
    return () => clearInterval(timer);
  }, [raceID, selectedEventID]);

  const loadPulses = async () => {
    if (pulseLoadInFlight.current) return;
    pulseLoadInFlight.current = true;
    try {
      const data = await TimingService.ListTimingPulsesByEvent(raceID, selectedEventID);
        const sorted = [...(data || [])].sort((a, b) => a.place - b.place);
        setPulses(sorted);
        const next = (sorted.length > 0) ? Math.max(...sorted.map(d => d.place)) + 1 : 1;
        setNextPlace(next);
        if (!editingIDRef.current && !formDirtyRef.current) {
            setTargetPlace(next.toString());
        }
    } catch (error) {
      console.error(error);
    } finally {
      pulseLoadInFlight.current = false;
    }
  };

  const handleSelect = (p: TimingPulse) => {
    editingIDRef.current = p.id;
    formDirtyRef.current = true;
    setEditingID(p.id);
    setTargetPlace(p.place.toString());
    setTimeValue(formatStoredElapsedHundredths(p.raw_time));
    timeInputRef.current?.focus();
  };

  const resetForm = () => {
    editingIDRef.current = null;
    formDirtyRef.current = false;
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
                editingIDRef.current = null;
                formDirtyRef.current = false;
                loadPulses();
                resetForm();
            }).catch(console.error);
        }
    } else {
        TimingService.AddTimingPulseForEvent(raceID, selectedEventID, parseInt(targetPlace), timeValue)
          .then(() => {
            formDirtyRef.current = false;
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
    if (window.confirm("Delete all recorded times for the selected event?")) {
      TimingService.DeleteAllTimingPulsesForScope(raceID, selectedEventID).then(() => {
        editingIDRef.current = null;
        formDirtyRef.current = false;
        setEditingID(null);
        setTimeValue('');
        loadPulses();
      }).catch(console.error);
    }
  };

  const handleDeleteAllRace = () => {
    if (window.confirm("Delete all recorded times across all events for this race?")) {
      TimingService.DeleteAllTimingPulses(raceID, 0).then(() => {
        editingIDRef.current = null;
        formDirtyRef.current = false;
        setEditingID(null);
        setTimeValue('');
        loadPulses();
      }).catch(console.error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex-between" style={{ marginBottom: 'var(--space-lg)' }}>
        <div>
          <h2 style={{ marginBottom: '4px' }}>Finish Times</h2>
          <div className="text-dim">Review all finish captures or add and edit a time manually.</div>
        </div>
        <div className="flex-row">
          <div style={{ minWidth: '220px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, fontSize: '0.75em', color: 'var(--text-dim)' }}>EVENT</label>
            <select value={selectedEventID} onChange={e => setSelectedEventID(Number(e.target.value))}>
              <option value={0}>Common Chute — All Events</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>
          {editingID && <button onClick={resetForm} style={{ backgroundColor: '#444' }}>Cancel Editing</button>}
          <button onClick={handleDeleteAll} style={{ backgroundColor: 'var(--danger)' }}>Delete All Times</button>
          <button onClick={handleDeleteAllRace} style={{ backgroundColor: '#7a1f1f' }}>Delete All Race Times</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-lg)', border: '1px solid var(--accent)', backgroundColor: 'rgba(0, 123, 255, 0.03)' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
            <div style={{ width: '120px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>SEQUENCE #</label>
                <input type="number" value={targetPlace} onChange={e => { formDirtyRef.current = true; setTargetPlace(e.target.value); }} style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>TIME (HH:MM:SS.cc)</label>
                <input 
                    ref={timeInputRef}
                    placeholder="e.g. 00:18:24.00"
                    value={timeValue} 
                    onChange={e => { formDirtyRef.current = true; setTimeValue(e.target.value); }}
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
                        <th>Finish Time (Official)</th>
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
                                    {formatStoredElapsedHundredths(p.raw_time)}
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
                                No finish times recorded yet.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
  );
};
