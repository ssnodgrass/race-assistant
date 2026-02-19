import React, { useState, useEffect } from 'react';
import { ParticipantService, RunSignUpService, RaceService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { Participant, Event as RaceEvent, RSUEvent, Race } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface ParticipantManagementProps {
  raceID: number;
  events: RaceEvent[];
  participants: Participant[];
  onRefresh: () => void;
  onImport: () => void;
}

type SortKey = 'bib' | 'name' | 'gender' | 'age' | 'event' | 'checked';

export const ParticipantManagement: React.FC<ParticipantManagementProps> = ({ raceID, events, participants, onRefresh, onImport }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [showRSUImport, setShowRSUImport] = useState(false);
  const [editingID, setEditingID] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState({
    bib: '', first: '', last: '', gender: 'M', age: '30', dob: '', eventID: events[0]?.id || 0, checked: false
  });

  // Sorting State
  const [sortKey, setSortKey] = useState<SortKey>('bib');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // RSU Import State
  const [rsuEvents, setRsuEvents] = useState<RSUEvent[]>([]);
  const [eventMappings, setEventMappings] = useState<Record<number, number>>({}); 
  const [startBib, setStartBib] = useState('100');
  const [assignNewBibs, setAssignNewBibs] = useState(true);

  const isBrowser = !(window as any).wails;

  useEffect(() => {
    if (showRSUImport) loadRSUInfo();
  }, [showRSUImport]);

  const loadRSUInfo = async () => {
    try {
        const race = await RaceService.GetByID(raceID);
        if (race?.rsu?.race_id && race.rsu.api_key && race.rsu.api_secret) {
            const list = await RunSignUpService.GetRSUEvents(race.rsu.race_id, race.rsu.api_key, race.rsu.api_secret);
            const localYear = new Date(race.date).getFullYear();
            const filtered = (list || []).filter(re => new Date(re.start_time).getFullYear() === localYear);
            setRsuEvents(filtered);
            const initialMap: Record<number, number> = {};
            filtered.forEach(re => {
                const match = events.find(le => le.name.toLowerCase() === re.name.toLowerCase());
                if (match) initialMap[re.event_id] = match.id;
            });
            setEventMappings(initialMap);
        }
    } catch (e) { console.error(e); }
  };

  const handleRSUImportAction = async () => {
    const race = await RaceService.GetByID(raceID);
    if (!race?.rsu?.race_id || !race?.rsu?.api_key || !race?.rsu?.api_secret) {
        return alert("Configure RunSignUp credentials in the Race Dashboard first!");
    }

    setIsSyncing(true);
    let total = 0;
    let nextBib = parseInt(startBib) || 1;

    try {
        for (const rsuEv of rsuEvents) {
            const localEventID = eventMappings[rsuEv.event_id];
            if (!localEventID) continue; 
            const incoming = await RunSignUpService.GetParticipants(race.rsu.race_id, rsuEv.event_id.toString(), race.rsu.api_key, race.rsu.api_secret);
            for (const p of incoming) {
                const isDup = participants.some(it => {
                    if (p.bib_number && it.bib_number === p.bib_number) return true;
                    if (!p.bib_number && it.first_name === p.first_name && it.last_name === p.last_name) return true;
                    return false;
                });
                if (!isDup) {
                    p.race_id = raceID;
                    p.event_id = localEventID;
                    if (!p.bib_number && assignNewBibs) {
                        p.bib_number = nextBib.toString();
                        nextBib++;
                    }
                    await ParticipantService.AddParticipant(new Participant(p));
                    total++;
                }
            }
        }
        alert(`Imported ${total} participants.`);
        setShowRSUImport(false);
        onRefresh();
    } catch (e) { alert("Failed: " + e); } finally { setIsSyncing(false); }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const handleToggleCheckIn = (p: Participant) => {
    ParticipantService.ToggleCheckIn(p.id).then(onRefresh).catch(console.error);
  };

  const handleEdit = (p: Participant) => {
    setEditingID(p.id);
    setForm({
      bib: p.bib_number, first: p.first_name, last: p.last_name, gender: p.gender,
      age: p.age_on_race_day.toString(), dob: p.dob ? p.dob.split('T')[0] : '', eventID: p.event_id, checked: p.checked_in
    });
    setIsAdding(true);
  };

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Delete ${name}?`)) ParticipantService.DeleteParticipant(id).then(onRefresh).catch(console.error);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new Participant({
      id: editingID || 0, race_id: raceID, event_id: Number(form.eventID),
      bib_number: form.bib, first_name: form.first, last_name: form.last,
      gender: form.gender, age_on_race_day: parseInt(form.age) || 0,
      dob: form.dob ? new Date(form.dob).toISOString() : null, checked_in: form.checked
    });
    const action = editingID ? ParticipantService.UpdateParticipant(p) : ParticipantService.AddParticipant(p);
    action.then(() => { setIsAdding(false); setEditingID(null); onRefresh(); }).catch(console.error);
  };

  const filteredParticipants = participants.filter(p => {
    const query = searchQuery.toLowerCase();
    return p.bib_number.toLowerCase().includes(query) ||
           p.first_name.toLowerCase().includes(query) ||
           p.last_name.toLowerCase().includes(query) ||
           p.gender.toLowerCase().includes(query);
  });

  const sortedParticipants = [...filteredParticipants].sort((a, b) => {
    let res = 0;
    if (sortKey === 'bib') res = (parseInt(a.bib_number) || 0) - (parseInt(b.bib_number) || 0);
    else if (sortKey === 'name') res = `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`);
    else if (sortKey === 'gender') res = a.gender.localeCompare(b.gender);
    else if (sortKey === 'age') res = a.age_on_race_day - b.age_on_race_day;
    else if (sortKey === 'event') res = (events.find(e => e.id === a.event_id)?.name || '').localeCompare(events.find(e => e.id === b.event_id)?.name || '');
    else if (sortKey === 'checked') res = (a.checked_in === b.checked_in) ? 0 : (a.checked_in ? -1 : 1);
    return sortDir === 'asc' ? res : -res;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex-between" style={{ marginBottom: 'var(--space-lg)' }}>
        <h2>Participants <span className="text-dim" style={{ fontSize: '0.6em', fontWeight: 400 }}>({participants.length} total)</span></h2>
        <div className="flex-row">
            <button onClick={() => { setIsAdding(!isAdding); setShowRSUImport(false); }}>
                {isAdding ? 'Cancel' : '+ Add Participant'}
            </button>
            <button onClick={onImport} style={{ backgroundColor: '#444' }}>CSV Import</button>
            {!isBrowser && (
                <button onClick={() => { setShowRSUImport(!showRSUImport); setIsAdding(false); }} style={{ backgroundColor: 'var(--accent)' }}>RSU Import</button>
            )}
            <button onClick={() => {
                const start = window.prompt("Start bib sequence at:", "100");
                if (start) ParticipantService.ReassignBibs(raceID, parseInt(start)).then(onRefresh);
            }} style={{ backgroundColor: '#666' }}>Bulk Bibs</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '15px', padding: '12px 20px' }}>
        <span style={{ fontSize: '1.2em', opacity: 0.5 }}>🔍</span>
        <input 
            type="text" 
            placeholder="Search by Bib, Name, or Gender..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            style={{ border: 'none', background: 'transparent', padding: 0, width: '100%', boxShadow: 'none' }} 
        />
        {searchQuery && <button onClick={() => setSearchQuery('')} style={{ backgroundColor: 'transparent', color: 'var(--text-dim)', padding: '4px 8px' }}>✕</button>}
      </div>

      {showRSUImport && (
        <div className="card" style={{ marginBottom: 'var(--space-lg)', border: '2px solid var(--accent)' }}>
            <h3 style={{ marginTop: 0 }}>Import from RunSignUp</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                <div>
                    <h4 style={{ color: 'var(--text-dim)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.05em' }}>1. Map Events</h4>
                    <table style={{ width: '100%', textAlign: 'left' }}>
                        <thead><tr><th>RunSignUp Event</th><th>Local Target</th></tr></thead>
                        <tbody>
                            {rsuEvents.map(re => (
                                <tr key={re.event_id}>
                                    <td style={{fontSize: '0.9em', padding: '8px 0'}}>{re.name}</td>
                                    <td>
                                        <select value={eventMappings[re.event_id] || ''} onChange={e => setEventMappings({...eventMappings, [re.event_id]: parseInt(e.target.value)})} style={{ padding: '4px 8px', fontSize: '0.9em' }}>
                                            <option value="">-- Skip --</option>
                                            {events.map(le => <option key={le.id} value={le.id}>{le.name}</option>)}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-dim)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.05em' }}>2. Bib Assignment</h4>
                    <div style={{ backgroundColor: '#ffffff05', padding: 'var(--space-md)', borderRadius: 'var(--radius)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: assignNewBibs ? '15px' : 0 }}>
                            <input type="checkbox" checked={assignNewBibs} onChange={e => setAssignNewBibs(e.target.checked)} style={{ width: 'auto' }} />
                            <span>Assign new bibs if missing in RSU</span>
                        </label>
                        {assignNewBibs && (
                            <div className="flex-row">
                                <label style={{ margin: 0 }}>Start sequence at:</label>
                                <input type="number" value={startBib} onChange={e => setStartBib(e.target.value)} style={{ width: '100px' }} />
                            </div>
                        )}
                    </div>
                    <button onClick={handleRSUImportAction} style={{ width: '100%', padding: '15px', marginTop: '10px' }} disabled={isSyncing}>IMPORT DATA</button>
                </div>
            </div>
        </div>
      )}

      {isAdding && (
        <div className="card" style={{ marginBottom: 'var(--space-lg)', border: '1px solid var(--accent)' }}>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
            <div className="flex-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>BIB #</label>
                <input value={form.bib} onChange={e => setForm({...form, bib: e.target.value})} required />
            </div>
            <div className="flex-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>EVENT</label>
                <select value={form.eventID} onChange={e => setForm({...form, eventID: Number(e.target.value)})}>
                    {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                </select>
            </div>
            <div className="flex-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>FIRST NAME</label>
                <input value={form.first} onChange={e => setForm({...form, first: e.target.value})} required />
            </div>
            <div className="flex-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>LAST NAME</label>
                <input value={form.last} onChange={e => setForm({...form, last: e.target.value})} required />
            </div>
            <div className="flex-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>GENDER</label>
                <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
                    <option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
                </select>
            </div>
            <div className="flex-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>AGE</label>
                <input type="number" value={form.age} onChange={e => setForm({...form, age: e.target.value})} required />
            </div>
            <div style={{ alignSelf: 'center', paddingTop: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.checked} onChange={e => setForm({...form, checked: e.target.checked})} style={{ width: 'auto' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>CHECKED IN</span>
                </label>
            </div>
            <div style={{ alignSelf: 'center', paddingTop: '20px', textAlign: 'right' }}>
                <button type="submit" style={{ minWidth: '120px' }}>{editingID ? 'Save' : 'Register'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-card" style={{ flexGrow: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ cursor: 'pointer' }}>
              <th onClick={() => toggleSort('checked')} style={{ width: '140px', paddingLeft: 'var(--space-lg)' }}>Check-In {sortKey === 'checked' && (sortDir === 'asc' ? '↑' : '↓')}</th>
              <th onClick={() => toggleSort('bib')}>Bib {sortKey === 'bib' && (sortDir === 'asc' ? '↑' : '↓')}</th>
              <th onClick={() => toggleSort('name')}>Name {sortKey === 'name' && (sortDir === 'asc' ? '↑' : '↓')}</th>
              <th onClick={() => toggleSort('gender')} style={{ width: '60px' }}>G</th>
              <th onClick={() => toggleSort('age')} style={{ width: '80px' }}>Age</th>
              <th onClick={() => toggleSort('event')}>Event</th>
              <th style={{ textAlign: 'right', paddingRight: 'var(--space-lg)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedParticipants.map(p => (
              <tr key={p.id} style={{ opacity: p.checked_in ? 1 : 0.5, backgroundColor: p.checked_in ? '#ffffff03' : 'transparent' }}>
                <td style={{ paddingLeft: 'var(--space-lg)' }}>
                    <input type="checkbox" checked={p.checked_in} onChange={() => handleToggleCheckIn(p)} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                </td>
                <td><strong style={{ color: p.checked_in ? 'var(--accent)' : 'inherit' }}>{p.bib_number || '---'}</strong></td>
                <td>{p.first_name} {p.last_name}</td>
                <td>{p.gender}</td>
                <td>{p.age_on_race_day}</td>
                <td style={{ fontSize: '0.9em', color: 'var(--text-dim)' }}>{events.find(ev => ev.id === p.event_id)?.name}</td>
                <td style={{ textAlign: 'right', paddingRight: 'var(--space-lg)' }}>
                    <button onClick={() => handleEdit(p)} style={{ backgroundColor: 'transparent', color: 'var(--text-dim)', padding: '4px 8px' }}>Edit</button>
                    <button onClick={() => handleDelete(p.id, `${p.first_name} ${p.last_name}`)} style={{ backgroundColor: 'transparent', color: 'var(--danger)', padding: '4px 8px' }}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedParticipants.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-dim)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🏃💨</div>
                No participants found matching your criteria.
            </div>
        )}
      </div>
    </div>
  );
};
