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
  const [baudRate, setBaudRate] = useState(1200);
  const [dataBits, setDataBits] = useState(7);
  const [stopBits, setStopBits] = useState('1');
  const [parity, setParity] = useState('even');
  const [isCapturing, setIsCapturing] = useState(false);
  const [captured, setCaptured] = useState<ImportedTime[]>([]);
  const [rawLog, setRawLog] = useState<string[]>([]);
  const [bytesRead, setBytesRead] = useState(0);
  const [manualText, setManualText] = useState('');
  const [, setStatus] = useState('Idle');

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshPorts();
    
    const unsubTime = Events.On('stopwatch:time', (e) => {
        const newTime = e.data as ImportedTime;
        setCaptured(prev => [...prev, newTime]);
    });

    const unsubProgress = Events.On('stopwatch:progress', (e) => {
        const payload = e.data as { bytesRead?: number };
        setBytesRead(payload?.bytesRead || 0);
    });

    const unsubSummary = Events.On('stopwatch:summary', (e) => {
        const payload = e.data as {
            recordsParsed?: number;
            selectedSegment?: number;
            segmentCount?: number;
            selectedSegmentRecords?: number;
            stopTime?: string;
            bytesRead?: number;
            error?: string;
            dumpTextPath?: string;
            dumpBinaryPath?: string;
            dumpError?: string;
        };
        if (payload?.bytesRead) setBytesRead(payload.bytesRead);
        const line = payload?.error
            ? `Parse error: ${payload.error}`
            : `Parsed ${payload?.recordsParsed || 0} records from segment ${payload?.selectedSegment || "?"}/${payload?.segmentCount || "?"} (footer count ${payload?.selectedSegmentRecords || 0}, stop ${payload?.stopTime || "n/a"}).`;
        const dumpLine = payload?.dumpTextPath
            ? `Capture dump saved: ${payload.dumpTextPath} (bin: ${payload.dumpBinaryPath || "n/a"})`
            : payload?.dumpError
                ? `Capture dump error: ${payload.dumpError}`
                : "";
        setRawLog(prev => [...prev, line, dumpLine].filter(Boolean).slice(-20));
    });

    const unsubComplete = Events.On('stopwatch:capture-complete', (e) => {
        const payload = e.data as { recordsParsed?: number };
        setIsCapturing(false);
        setStatus("Reviewing");
        setRawLog(prev => [...prev, `Download complete. Parsed ${payload?.recordsParsed || 0} records.`].slice(-20));
    });

    const unsubError = Events.On('stopwatch:error', (e) => {
        alert("Serial Error: " + e.data);
    });

    return () => { 
        unsubTime(); 
        unsubProgress();
        unsubSummary();
        unsubComplete();
        unsubError();
    };
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
        setBytesRead(0);
        StopwatchService.StartCapture(selectedPort, baudRate, dataBits, stopBits, parity).then(() => {
            setIsCapturing(true);
            setStatus("Listening...");
        }).catch(err => alert(err));
    }
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, fontSize: '0.75em', color: 'var(--text-dim)' }}>PORT</label>
                    <div className="flex-row">
                        <select style={{ flex: 1 }} value={selectedPort} onChange={e => setSelectedPort(e.target.value)}>
                            <option value="">-- Select --</option>
                            {ports.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <button onClick={refreshPorts} style={{ backgroundColor: '#444' }}>↻</button>
                    </div>
                </div>
                <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, fontSize: '0.75em', color: 'var(--text-dim)' }}>BAUD</label>
                    <select value={baudRate} onChange={e => setBaudRate(Number(e.target.value))}>
                        <option value={1200}>1200</option>
                        <option value={2400}>2400</option>
                        <option value={4800}>4800</option>
                        <option value={9600}>9600</option>
                    </select>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, fontSize: '0.75em', color: 'var(--text-dim)' }}>DATA</label>
                    <select value={dataBits} onChange={e => setDataBits(Number(e.target.value))}>
                        <option value={7}>7</option>
                        <option value={8}>8</option>
                    </select>
                </div>
                <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, fontSize: '0.75em', color: 'var(--text-dim)' }}>STOP</label>
                    <select value={stopBits} onChange={e => setStopBits(e.target.value)}>
                        <option value="1">1</option>
                        <option value="1.5">1.5</option>
                        <option value="2">2</option>
                    </select>
                </div>
                <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, fontSize: '0.75em', color: 'var(--text-dim)' }}>PARITY</label>
                    <select value={parity} onChange={e => setParity(e.target.value)}>
                        <option value="none">None</option>
                        <option value="even">Even</option>
                        <option value="odd">Odd</option>
                    </select>
                </div>
            </div>

            <div className="card" style={{ backgroundColor: '#000', border: '1px solid var(--border)', margin: 0 }}>
                <h3 style={{ fontSize: '1rem' }}>Console</h3>
                <div style={{ fontSize: '0.75rem', color: '#7aa', marginBottom: '8px' }}>
                    Download is automatic. The app sends the upload command and parses results when transfer completes.
                </div>
                
                <div style={{ 
                    height: '150px', backgroundColor: 'black', 
                    color: '#0f0', fontFamily: 'monospace', fontSize: '0.85em', 
                    overflowY: 'auto', padding: '10px', border: '1px solid #333',
                    borderRadius: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                }}>
                    <div style={{ marginBottom: '8px', color: '#8f8' }}>
                        Bytes read: {bytesRead}
                    </div>
                    <div style={{ height: '8px', border: '1px solid #355', borderRadius: '4px', marginBottom: '10px' }}>
                        <div style={{
                            width: `${Math.min(100, Math.floor((bytesRead / 8300) * 100))}%`,
                            height: '100%',
                            backgroundColor: '#2c8f55'
                        }} />
                    </div>
                    {rawLog.map((line, i) => <div key={i}>{line}</div>)}
                    <div ref={logEndRef} />
                </div>
            </div>

            <button 
                onClick={toggleCapture} 
                style={{ width: '100%', padding: '15px', marginTop: '20px', backgroundColor: isCapturing ? 'var(--danger)' : 'var(--accent)' }}
            >
                {isCapturing ? '🛑 Stop Download' : '⬇️ Download From Stopwatch'}
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
