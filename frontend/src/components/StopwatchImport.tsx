import React, { useState, useEffect, useRef } from 'react';
import { Events } from "@wailsio/runtime";
import { StopwatchService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { ImportedTime } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface StopwatchImportProps {
  raceID: number;
  onComplete: () => void;
}

export const StopwatchImport: React.FC<StopwatchImportProps> = ({ raceID, onComplete }) => {
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [captured, setCaptured] = useState<ImportedTime[]>([]);
  const [rawLog, setRawLog] = useState<string[]>([]);
  const [manualText, setManualText] = useState('');
  const [, setStatus] = useState('Idle');
  const [command, setSendCommand] = useState('D'); // 'D' is common for Download

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshPorts();
    
    const unsubTime = Events.On('stopwatch:time', (e) => {
        const newTime = e.data as ImportedTime;
        setCaptured(prev => [...prev, newTime]);
    });

    const unsubRaw = Events.On('stopwatch:raw', (e) => {
        setRawLog(prev => [...prev, e.data as string].slice(-50));
    });

    return () => { unsubTime(); unsubRaw(); };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rawLog]);

  const refreshPorts = () => StopwatchService.ListPorts().then(setPorts).catch(console.error);

  const toggleCapture = () => {
    if (isCapturing) {
        StopwatchService.StopCapture().then(data => {
            setCaptured(data || []);
            setIsCapturing(false);
            setStatus("Reviewing");
        });
    } else {
        if (!selectedPort) return alert("Select a port first");
        setCaptured([]);
        setRawLog([]);
        StopwatchService.StartCapture(selectedPort).then(() => {
            setIsCapturing(true);
            setStatus("Listening...");
        }).catch(err => alert(err));
    }
  };

  const sendCommand = () => {
    if (!selectedPort) return;
    StopwatchService.SendCommand(selectedPort, command).catch(err => alert(err));
  };

  const handleManualParse = () => {
    StopwatchService.ParseStopwatchText(manualText).then(data => {
        setCaptured(data || []);
        setStatus("Reviewing (Manual)");
    });
  };

  const handleCommit = () => {
    if (captured.length === 0) return;
    if (window.confirm(`Import ${captured.length} times?`)) {
        StopwatchService.CommitToRace(raceID, captured).then(() => {
            alert("Imported successfully");
            onComplete();
        });
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
      <div className="card">
        <h2>Hardware Interface</h2>
        <div style={{ marginBottom: '20px' }}>
            <label>Select Port:</label>
            <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                <select style={{ flex: 1 }} value={selectedPort} onChange={e => setSelectedPort(e.target.value)}>
                    <option value="">-- Select --</option>
                    {ports.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <button onClick={refreshPorts} style={{ backgroundColor: '#444' }}>↻</button>
            </div>
        </div>

        <div className="card" style={{ backgroundColor: '#111', border: '1px solid #333' }}>
            <h3>Terminal Commands</h3>
            <p style={{ fontSize: '0.8em', color: 'var(--text-dim)' }}>Try 'D' for Download or '?' for Status.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
                <input style={{ flex: 1 }} value={command} onChange={e => setSendCommand(e.target.value)} />
                <button onClick={sendCommand} disabled={!isCapturing}>Send</button>
            </div>
            
            <div style={{ 
                marginTop: '15px', height: '150px', backgroundColor: 'black', 
                color: '#0f0', fontFamily: 'monospace', fontSize: '0.8em', 
                overflowY: 'auto', padding: '10px', border: '1px solid #444' 
            }}>
                {rawLog.map((line, i) => <div key={i}>{line}</div>)}
                <div ref={logEndRef} />
            </div>
        </div>

        <button 
            onClick={toggleCapture} 
            style={{ width: '100%', padding: '15px', marginTop: '20px', backgroundColor: isCapturing ? 'var(--danger)' : 'var(--accent)' }}
        >
            {isCapturing ? 'Stop Listening' : 'Start Serial Listener'}
        </button>

        <hr style={{ margin: '30px 0', borderColor: 'var(--border)' }} />

        <h3>Failsafe: Manual Text Paste</h3>
        <textarea 
            placeholder="Paste text from stopwatch software here..."
            style={{ width: '100%', height: '100px', backgroundColor: '#111', color: '#eee', padding: '10px' }}
            value={manualText}
            onChange={e => setManualText(e.target.value)}
        />
        <button onClick={handleManualParse} style={{ width: '100%', marginTop: '10px', backgroundColor: '#444' }}>Parse Pasted Text</button>
      </div>

      <div className="card">
        <h2>Review Captured Data</h2>
        <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
            {captured.length > 0 ? (
                <table>
                    <thead><tr><th>Place</th><th>Time</th></tr></thead>
                    <tbody>
                        {captured.map((c, i) => (
                            <tr key={i}><td>{c.place}</td><td style={{ fontFamily: 'monospace' }}>{c.time}</td></tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-dim)' }}>
                    {isCapturing ? 'Listening for pulses...' : 'No data captured yet.'}
                </div>
            )}
        </div>
        {captured.length > 0 && !isCapturing && (
            <button onClick={handleCommit} style={{ width: '100%', marginTop: '20px', padding: '15px' }}>
                Commit {captured.length} Pulses to Race
            </button>
        )}
      </div>
    </div>
  );
};
