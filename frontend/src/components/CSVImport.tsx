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
  const [defaultEvent, setDefaultEvent] = useState(events[0]?.id || 0);

  const selectFile = () => {
    DatabaseService.GetFilePath("Select CSV to Import").then((path: string) => {
        if (!path) return;
        setFilePath(path);
        ParticipantService.GetCSVHeaders(path).then(setHeaders).catch(console.error);
    });
  };

  const handleMappingChange = (field: string, colIndex: string) => {
    setMapping({ ...mapping, [field]: parseInt(colIndex) });
  };

  const startImport = () => {
    if (!filePath) return;
    
    // Create a map of Event Name -> Event ID for the backend to use for matching
    const eventLookup: Record<string, number> = {};
    events.forEach(ev => {
        eventLookup[ev.name] = ev.id;
    });

    ParticipantService.ImportParticipants(raceID, filePath, mapping, parseInt(startBib), defaultEvent, eventLookup)
        .then(onComplete)
        .catch(err => alert("Import failed: " + err));
  };

  const fields = [
    { name: 'first_name', label: 'First Name' },
    { name: 'last_name', label: 'Last Name' },
    { name: 'gender', label: 'Gender (M/F)' },
    { name: 'age', label: 'Age on Race Day' },
    { name: 'dob', label: 'Date of Birth' },
    { name: 'bib', label: 'Bib Number' },
    { name: 'event', label: 'Event Name' },
  ];

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Import Participants</h2>
        <button onClick={onCancel} style={{ backgroundColor: 'transparent', color: 'var(--text-dim)' }}>Cancel</button>
      </div>

      {!filePath ? (
        <div style={{ textAlign: 'center', padding: '60px', border: '2px dashed var(--border)', borderRadius: '8px' }}>
            <p style={{ color: 'var(--text-dim)', marginBottom: '20px' }}>Select a RunSignUp or custom CSV file to begin matching columns.</p>
            <button onClick={selectFile} style={{ padding: '15px 40px', fontSize: '1.1em' }}>Select CSV File</button>
        </div>
      ) : (
        <div>
            <div className="card" style={{ backgroundColor: '#111', border: '1px solid #333' }}>
                <strong>File:</strong> <span style={{ color: 'var(--accent)' }}>{filePath}</span>
            </div>

            <div style={{ display: 'flex', gap: '30px', marginTop: '20px' }}>
                <section style={{ flex: 1 }}>
                    <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>1. Map CSV Columns</h3>
                    <p style={{ fontSize: '0.85em', color: 'var(--text-dim)', marginBottom: '15px' }}>
                        Match the fields on the left to the columns found in your file.
                    </p>
                    {fields.map(f => (
                        <div key={f.name} style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontWeight: '500' }}>{f.label}:</label>
                            <select onChange={(e) => handleMappingChange(f.name, e.target.value)} style={{ width: '220px' }}>
                                <option value="-1">-- Skip / Not in CSV --</option>
                                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                            </select>
                        </div>
                    ))}
                </section>

                <section style={{ flex: 1, borderLeft: '1px solid var(--border)', paddingLeft: '30px' }}>
                    <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>2. Import Logic</h3>
                    
                    <div style={{ marginBottom: '20px' }}>
                        <label>Default / Fallback Event:</label>
                        <p style={{ fontSize: '0.8em', color: 'var(--text-dim)', margin: '5px 0' }}>
                            Used if 'Event Name' is not mapped or doesn't match a CSV value.
                        </p>
                        <select value={defaultEvent} onChange={e => setDefaultEvent(Number(e.target.value))} style={{ width: '100%' }}>
                            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                        </select>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label>Starting Bib Number:</label>
                        <p style={{ fontSize: '0.8em', color: 'var(--text-dim)', margin: '5px 0' }}>
                            If a row has no Bib #, it will be assigned sequentially starting here.
                        </p>
                        <input type="number" value={startBib} onChange={e => setStartBib(e.target.value)} style={{ width: '100%' }} />
                    </div>

                    <div className="card" style={{ marginTop: '40px', backgroundColor: '#ffffff05' }}>
                        <h4>Ready?</h4>
                        <p style={{ fontSize: '0.85em', color: 'var(--text-dim)' }}>
                            Duplicates check: The system will create new records. Ensure you haven't already imported this file.
                        </p>
                        <button onClick={startImport} style={{ width: '100%', padding: '15px', marginTop: '10px', fontSize: '1.1em' }}>
                            Process Import Now
                        </button>
                    </div>
                </section>
            </div>
        </div>
      )}
    </div>
  );
};
