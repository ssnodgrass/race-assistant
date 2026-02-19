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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        <div className="card" style={{ margin: 0 }}>
            <h2 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: 'var(--space-md)' }}>Hardware Interface</h2>
            <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>SELECT PORT</label>
                <div className="flex-row">
                    <select style={{ flex: 1 }} value={selectedPort} onChange={e => setSelectedPort(e.target.value)}>
                        <option value="">-- Select Serial Port --</option>
                        {ports.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button onClick={refreshPorts} style={{ backgroundColor: '#444' }}>↻</button>
                </div>
            </div>

            <div className="card" style={{ backgroundColor: '#000', border: '1px solid var(--border)', margin: 0 }}>
                <h3 style={{ fontSize: '1rem' }}>Console</h3>
                <div className="flex-row" style={{ marginBottom: '10px' }}>
                    <input style={{ flex: 1, height: '36px' }} value={command} onChange={e => setSendCommand(e.target.value)} placeholder="Send command..." />
                    <button onClick={sendCommand} disabled={!isCapturing} style={{ height: '36px' }}>Send</button>
                </div>
                
                <div style={{ 
                    height: '150px', backgroundColor: 'black', 
                    color: '#0f0', fontFamily: 'monospace', fontSize: '0.85em', 
                    overflowY: 'auto', padding: '10px', border: '1px solid #333',
                    borderRadius: '4px'
                }}>
                    {rawLog.map((line, i) => <div key={i}>{line}</div>)}
                    <div ref={logEndRef} />
                </div>
            </div>

            <button 
                onClick={toggleCapture} 
                style={{ width: '100%', padding: '15px', marginTop: '20px', backgroundColor: isCapturing ? 'var(--danger)' : 'var(--accent)' }}
            >
                {isCapturing ? '🛑 Stop Listening' : '🔌 Start Serial Listener'}
            </button>
        </div>

        <div className="card" style={{ margin: 0 }}>
            <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: 'var(--space-md)' }}>Failsafe: Manual Paste</h3>
            <textarea 
                placeholder="e.g. 001 00:12:34.567"
                style={{ width: '100%', height: '100px', backgroundColor: '#000', color: '#eee', padding: '10px', border: '1px solid var(--border)', borderRadius: '4px', resize: 'none' }}
                value={manualText}
                onChange={e => setManualText(e.target.value)}
            />
            <button onClick={handleManualParse} style={{ width: '100%', marginTop: '10px', backgroundColor: '#444' }}>Parse Pasted Text</button>
        </div>
      </div>

      <div className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: 'var(--space-md)' }}>Review Staged Data</h2>
        <div className="table-container" style={{ flexGrow: 1 }}>
            {captured.length > 0 ? (
                <table style={{ borderCollapse: 'collapse' }}>
                    <thead>
                        <tr><th style={{ paddingLeft: 'var(--space-md)' }}>Place</th><th>Captured Time</th></tr>
                    </thead>
                    <tbody>
                        {captured.map((c, i) => (
                            <tr key={i}><td style={{ paddingLeft: 'var(--space-md)' }}>{c.place}</td><td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)' }}>{c.time}</td></tr>
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
            <button onClick={handleCommit} style={{ width: '100%', marginTop: '20px', padding: '15px', backgroundColor: 'var(--success)' }}>
                COMMIT {captured.length} PULSES TO DATABASE
            </button>
        )}
      </div>
    </div>
  );
};
