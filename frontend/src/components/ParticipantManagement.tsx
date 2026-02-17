import React, { useState, useEffect } from 'react';
import { ParticipantService, ReportingService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { DatabaseService } from '../../bindings/github.com/ssnodgrass/race-assistant';
import { Participant, Event as RaceEvent } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface ParticipantManagementProps {
  raceID: number;
  events: RaceEvent[];
  participants: Participant[];
  onRefresh: () => void;
  onImport: () => void;
}

export const ParticipantManagement: React.FC<ParticipantManagementProps> = ({ raceID, events, participants, onRefresh, onImport }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingID, setEditingID] = useState<number | null>(null);
  const [form, setForm] = useState({
    bib: '', first: '', last: '', gender: 'M', age: '30', dob: '', eventID: events[0]?.id || 0
  });

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
    const action = editingID 
        ? ParticipantService.UpdateParticipant(p)
        : ParticipantService.AddParticipant(p);

    action.then(() => {
        setIsAdding(false);
        resetForm();
        onRefresh();
      })
      .catch(console.error);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Participants ({participants.length})</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { if(isAdding) resetForm(); setIsAdding(!isAdding); }}>
                {isAdding ? 'Cancel' : 'Add Participant'}
            </button>
            <button onClick={onImport} style={{ backgroundColor: '#444' }}>Import from CSV...</button>
            <button onClick={handlePrintLabels} style={{ backgroundColor: 'var(--success)' }}>Print Bib Labels</button>
        </div>
      </div>

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
