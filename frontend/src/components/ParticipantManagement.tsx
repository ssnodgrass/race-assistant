import React, { useState, useEffect } from 'react';
import { ParticipantService, ReportingService, RunSignUpService, RaceService, SettingsService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { DatabaseService } from '../../bindings/github.com/ssnodgrass/race-assistant';
import { Participant, Event as RaceEvent, Race, RSUEvent } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface ParticipantManagementProps {
  raceID: number;
  events: RaceEvent[];
  participants: Participant[];
  onRefresh: () => void;
  onImport: () => void;
}

export const ParticipantManagement: React.FC<ParticipantManagementProps> = ({ raceID, events, participants, onRefresh, onImport }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [showRSUImport, setShowRSUImport] = useState(false);
  const [editingID, setEditingID] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [form, setForm] = useState({
    bib: '', first: '', last: '', gender: 'M', age: '30', dob: '', eventID: events[0]?.id || 0
  });

  // RSU Import State
  const [rsuEvents, setRsuEvents] = useState<RSUEvent[]>([]);
  const [eventMappings, setEventMappings] = useState<Record<number, number>>({}); // RSU Event ID -> Local Event ID
  const [startBib, setStartBib] = useState('100');

  const isBrowser = !(window as any).wails;

  useEffect(() => {
    if (showRSUImport) loadRSUInfo();
  }, [showRSUImport]);

  const loadRSUInfo = async () => {
    try {
        const [race, apiKey, apiSecret] = await Promise.all([
            RaceService.GetByID(raceID),
            SettingsService.Get('rsu_api_key'),
            SettingsService.Get('rsu_api_secret')
        ]);
        if (race?.rsu?.race_id && apiKey && apiSecret) {
            const list = await RunSignUpService.GetRSUEvents(race.rsu.race_id, apiKey, apiSecret);
            setRsuEvents(list || []);
            // Default mapping: try to match names
            const initialMap: Record<number, number> = {};
            list?.forEach(re => {
                const match = events.find(le => le.name.toLowerCase() === re.name.toLowerCase());
                if (match) initialMap[re.event_id] = match.id;
            });
            setEventMappings(initialMap);
        }
    } catch (e) { console.error(e); }
  };

  const handleRSUImportAction = async () => {
    const [race, apiKey, apiSecret] = await Promise.all([
        RaceService.GetByID(raceID),
        SettingsService.Get('rsu_api_key'),
        SettingsService.Get('rsu_api_secret')
    ]);

    if (!race?.rsu?.race_id || !apiKey || !apiSecret) return alert("Credentials missing!");

    setIsSyncing(true);
    let total = 0;
    let nextBib = parseInt(startBib) || 1;

    try {
        for (const rsuEv of rsuEvents) {
            const localEventID = eventMappings[rsuEv.event_id];
            if (!localEventID) continue; // Skip unmapped events

            const incoming = await RunSignUpService.GetParticipants(race.rsu.race_id, rsuEv.event_id.toString(), apiKey, apiSecret);
            for (const p of incoming) {
                const isDup = participants.some(it => {
                    if (p.bib_number && it.bib_number === p.bib_number) return true;
                    if (!p.bib_number && it.first_name === p.first_name && it.last_name === p.last_name) return true;
                    return false;
                });

                if (!isDup) {
                    p.race_id = raceID;
                    p.event_id = localEventID;
                    if (!p.bib_number) {
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

  const handleBulkReassign = () => {
    const start = window.prompt("Start reassigning ALL bibs from which number?", "100");
    if (start && window.confirm("This will overwrite EVERY bib number in this race. Continue?")) {
        ParticipantService.ReassignBibs(raceID, parseInt(start)).then(() => {
            alert("Bibs Reassigned");
            onRefresh();
        }).catch(console.error);
    }
  };

  const getNextBib = () => {
    if (!participants.length) return "1";
    const maxBib = Math.max(...participants.map(p => parseInt(p.bib_number) || 0));
    return (maxBib + 1).toString();
  };

  useEffect(() => {
    if (isAdding && !editingID && !form.bib) {
        setForm(f => ({ ...f, bib: getNextBib(), eventID: events[0]?.id || 0 }));
    }
  }, [isAdding, editingID, participants, events]);

  const resetForm = () => {
    setForm({
      bib: getNextBib(), first: '', last: '', gender: 'M', age: '30', dob: '', eventID: events[0]?.id || 0
    });
    setEditingID(null);
  };

  const handleEdit = (p: Participant) => {
    setEditingID(p.id);
    setForm({
      bib: p.bib_number,
      first: p.first_name,
      last: p.last_name,
      gender: p.gender,
      age: p.age_on_race_day.toString(),
      dob: p.dob ? p.dob.split('T')[0] : '',
      eventID: p.event_id
    });
    setIsAdding(true);
  };

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      ParticipantService.DeleteParticipant(id)
        .then(onRefresh)
        .catch(console.error);
    }
  };

  const handlePrintLabels = () => {
    DatabaseService.GetSavePath("Save Bib Labels PDF", "Bib_Labels.pdf").then((path: string) => {
        if (!path) return;
        ReportingService.GenerateBibLabels(raceID, path)
            .then(() => alert("Labels Generated Successfully"))
            .catch(err => alert("Failed to generate labels: " + err));
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dobValue = form.dob ? new Date(form.dob).toISOString() : null;
    const pData = {
      id: editingID || 0,
      race_id: raceID,
      event_id: Number(form.eventID),
      bib_number: form.bib,
      first_name: form.first,
      last_name: form.last,
      gender: form.gender,
      age_on_race_day: parseInt(form.age) || 0,
      dob: dobValue
    };

    const p = new Participant(pData);
    const action = editingID ? ParticipantService.UpdateParticipant(p) : ParticipantService.AddParticipant(p);
    action.then(() => { setIsAdding(false); resetForm(); onRefresh(); }).catch(console.error);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Participants ({participants.length})</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { if(isAdding) resetForm(); setIsAdding(!isAdding); setShowRSUImport(false); }}>
                {isAdding ? 'Cancel' : 'Add Participant'}
            </button>
            <button onClick={onImport} style={{ backgroundColor: '#444' }}>CSV Import</button>
            {!isBrowser && (
                <button onClick={() => { setShowRSUImport(!showRSUImport); setIsAdding(false); }} style={{ backgroundColor: 'var(--accent)' }}>
                    {showRSUImport ? 'Cancel Import' : 'RSU Import'}
                </button>
            )}
            <button onClick={handleBulkReassign} style={{ backgroundColor: '#666' }}>Bulk Bibs</button>
            <button onClick={handlePrintLabels} style={{ backgroundColor: 'var(--success)' }}>Labels</button>
        </div>
      </div>

      {showRSUImport && (
        <div className="card" style={{ marginBottom: '20px', border: '2px solid var(--accent)' }}>
            <h3>Import from RunSignUp</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                <div>
                    <h4>1. Map Events</h4>
                    <table style={{ width: '100%' }}>
                        <thead><tr style={{textAlign: 'left'}}><th>RunSignUp Event</th><th>Local Target</th></tr></thead>
                        <tbody>
                            {rsuEvents.map(re => (
                                <tr key={re.event_id}>
                                    <td style={{fontSize: '0.9em'}}>{re.name} ({re.start_time})</td>
                                    <td>
                                        <select value={eventMappings[re.event_id] || ''} onChange={e => setEventMappings({...eventMappings, [re.event_id]: parseInt(e.target.value)})}>
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
                    <h4>2. Bib Assignment</h4>
                    <label>If RSU bib is missing, start auto-increment at:</label><br/>
                    <input type="number" value={startBib} onChange={e => setStartBib(e.target.value)} style={{ fontSize: '1.2em', width: '100px', margin: '10px 0' }} />
                    <br/><br/>
                    <button onClick={handleRSUImportAction} style={{ width: '100%', padding: '15px' }} disabled={isSyncing}>
                        {isSyncing ? 'Importing Data...' : 'START IMPORT'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {isAdding && (
        <div className="card" style={{ marginBottom: '20px', border: '1px solid #007bff' }}>
          <h3>{editingID ? 'Edit Participant' : 'New Registration'}</h3>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
            <div>
                <label>Bib #</label><br/>
                <input style={{width: '100%'}} value={form.bib} onChange={e => setForm({...form, bib: e.target.value})} required />
            </div>
            <div>
                <label>Event</label><br/>
                <select style={{width: '100%'}} value={form.eventID} onChange={e => setForm({...form, eventID: Number(e.target.value)})}>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                </select>
            </div>
            <div>
                <label>Gender</label><br/>
                <select style={{width: '100%'}} value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Other</option>
                </select>
            </div>
            <div>
                <label>First Name</label><br/>
                <input style={{width: '100%'}} value={form.first} onChange={e => setForm({...form, first: e.target.value})} required />
            </div>
            <div>
                <label>Last Name</label><br/>
                <input style={{width: '100%'}} value={form.last} onChange={e => setForm({...form, last: e.target.value})} required />
            </div>
            <div>
                <label>Age on Race Day</label><br/>
                <input type="number" style={{width: '100%'}} value={form.age} onChange={e => setForm({...form, age: e.target.value})} required />
            </div>
            <div>
                <label>DOB (Optional)</label><br/>
                <input type="date" style={{width: '100%'}} value={form.dob} onChange={e => setForm({...form, dob: e.target.value})} />
            </div>
            <div style={{ gridColumn: 'span 3', marginTop: '10px' }}>
                <button type="submit" style={{ width: '200px' }}>{editingID ? 'Save Changes' : 'Register Participant'}</button>
                {editingID && <button type="button" onClick={resetForm} style={{ marginLeft: '10px', backgroundColor: '#666' }}>Cancel Edit</button>}
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th>Bib</th><th>Name</th><th>Gender</th><th>Age</th><th>Event</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
          </thead>
          <tbody>
            {participants.map(p => (
              <tr key={p.id}>
                <td>{p.bib_number}</td>
                <td>{p.first_name} {p.last_name}</td>
                <td>{p.gender}</td>
                <td>{p.age_on_race_day}</td>
                <td>{events.find(ev => ev.id === p.event_id)?.name}</td>
                <td style={{ textAlign: 'right' }}>
                    <button onClick={() => handleEdit(p)} style={{ padding: '2px 8px', marginRight: '5px', backgroundColor: '#444' }}>Edit</button>
                    <button onClick={() => handleDelete(p.id, `${p.first_name} ${p.last_name}`)} style={{ padding: '2px 8px', backgroundColor: '#a33' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
