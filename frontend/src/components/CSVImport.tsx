import React, { useState } from 'react';
import { ParticipantService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { DatabaseService } from '../../bindings/github.com/ssnodgrass/race-assistant';
import { Event as RaceEvent } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface CSVImportProps {
  raceID: number;
  events: RaceEvent[];
  onComplete: (count: number) => void;
  onCancel: () => void;
}

export const CSVImport: React.FC<CSVImportProps> = ({ raceID, events, onComplete, onCancel }) => {
  const [filePath, setFilePath] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [startBib, setStartBib] = useState('100');
  const [assignNewBibs, setAssignNewBibs] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [defaultEventID, setDefaultEventID] = useState(events[0]?.id || 0);
  const [isImporting, setIsImporting] = useState(false);

  const fields = [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'gender', label: 'Gender' },
    { key: 'age', label: 'Age' },
    { key: 'dob', label: 'DOB' },
    { key: 'bib', label: 'Bib Number' },
    { key: 'event', label: 'Event Name (Optional)' },
  ];

  const handleSelectFile = async () => {
    const path = await DatabaseService.GetFilePath("Select Participant CSV");
    if (path) {
      setFilePath(path);
      const cols = await ParticipantService.GetCSVHeaders(path);
      setHeaders(cols || []);
      
      const newMapping: Record<string, number> = {};
      cols?.forEach((h, i) => {
        const lowerH = h.toLowerCase();
        if (lowerH.includes('first')) newMapping['first_name'] = i;
        if (lowerH.includes('last')) newMapping['last_name'] = i;
        if (lowerH.includes('gender') || lowerH === 'sex') newMapping['gender'] = i;
        if (lowerH === 'age') newMapping['age'] = i;
        if (lowerH.includes('dob') || lowerH.includes('birth')) newMapping['dob'] = i;
        if (lowerH === 'bib' || lowerH.includes('number')) newMapping['bib'] = i;
        if (lowerH === 'event') newMapping['event'] = i;
      });
      setMapping(newMapping);
    }
  };

  const handleImport = async () => {
    if (!filePath) return;
    if (replaceExisting) {
        const confirmed = window.confirm("Delete all current participants for this race before importing this CSV?");
        if (!confirmed) return;
    }
    setIsImporting(true);
    try {
        const eventMap: Record<string, number> = {};
        events.forEach(e => { eventMap[e.name] = e.id; });

        const count = await ParticipantService.ImportParticipants(
            raceID, 
            filePath, 
            mapping, 
            assignNewBibs ? parseInt(startBib) : 0, 
            defaultEventID, 
            eventMap,
            replaceExisting
        );
        alert(`Successfully imported ${count} participants.`);
        onComplete(count);
    } catch (e) {
        alert("Import failed: " + e);
    } finally {
        setIsImporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex-between" style={{ marginBottom: 'var(--space-lg)' }}>
        <h2>Import Participants</h2>
        <button onClick={onCancel} style={{ backgroundColor: '#444' }}>Cancel</button>
      </div>

      {!filePath ? (
        <div className="card" style={{ textAlign: 'center', padding: '100px', border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '4rem', marginBottom: 'var(--space-lg)' }}>📄</div>
            <p className="text-dim" style={{ marginBottom: 'var(--space-lg)', fontSize: '1.1rem' }}>Select a CSV file to begin the mapping process.</p>
            <button onClick={handleSelectFile} style={{ padding: '15px 40px', fontSize: '1.1rem' }}>Select CSV File...</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 'var(--space-lg)', flexGrow: 1, minHeight: 0 }}>
            <div className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: 'var(--space-md)' }}>1. Map Columns</h3>
                <div className="table-container" style={{ flexGrow: 1 }}>
                    <table style={{ borderCollapse: 'collapse' }}>
                        <thead><tr><th style={{ paddingLeft: 'var(--space-md)' }}>Local Field</th><th>CSV Column Source</th></tr></thead>
                        <tbody>
                            {fields.map(f => (
                                <tr key={f.key}>
                                    <td style={{ paddingLeft: 'var(--space-md)' }}><strong>{f.label}</strong></td>
                                    <td>
                                        <select value={mapping[f.key] ?? ''} onChange={e => setMapping({...mapping, [f.key]: parseInt(e.target.value)})} style={{ width: '100%' }}>
                                            <option value="-1">-- Skip / Ignore --</option>
                                            {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: 'var(--space-md)' }}>2. Import Logic</h3>
                
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>FALLBACK EVENT</label>
                    <select value={defaultEventID} onChange={e => setDefaultEventID(parseInt(e.target.value))} style={{ width: '100%' }}>
                        {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                    </select>
                </div>
                
                <div style={{ backgroundColor: '#ffffff05', padding: 'var(--space-md)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '15px' }}>
                        <input type="checkbox" checked={replaceExisting} onChange={e => setReplaceExisting(e.target.checked)} style={{ width: 'auto' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>REPLACE CURRENT PARTICIPANTS FIRST</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: assignNewBibs ? '15px' : 0 }}>
                        <input type="checkbox" checked={assignNewBibs} onChange={e => setAssignNewBibs(e.target.checked)} style={{ width: 'auto' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>ASSIGN NEW BIB NUMBERS</span>
                    </label>
                    {assignNewBibs && (
                        <div className="flex-row">
                            <label style={{ margin: 0, fontSize: '0.85em' }}>START AT:</label>
                            <input type="number" value={startBib} onChange={e => setStartBib(e.target.value)} style={{ width: '100px' }} />
                        </div>
                    )}
                </div>

                <div style={{ marginTop: 'auto' }}>
                    <button onClick={handleImport} style={{ width: '100%', padding: '15px' }} disabled={isImporting}>
                        {isImporting ? 'Importing...' : 'START IMPORT'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
