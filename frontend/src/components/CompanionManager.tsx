import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CompanionService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { CompanionPairing, CompanionSetup, CompanionState, Event as RaceEvent, Race } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface Props { race: Race; events: RaceEvent[]; onRaceRefresh: () => void }

export function CompanionManager({ race, events, onRaceRefresh }: Props) {
  const [setup, setSetup] = useState<CompanionSetup | null>(null);
  const [state, setState] = useState<CompanionState | null>(null);
  const [pairing, setPairing] = useState<CompanionPairing | null>(null);
  const [selectedEventID, setSelectedEventID] = useState(0);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [server, active] = await Promise.all([
        CompanionService.GetSetup(), CompanionService.GetActiveState(race.id),
      ]);
      setSetup(server);
      setState(active.session ? active : null);
      if (active.session) setSelectedEventID(active.session.event_id);
      setError('');
    } catch (e) { setError(String(e)); }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [race.id]);

  useEffect(() => { if (state?.race_start) onRaceRefresh(); }, [state?.race_start]);

  const startSession = async () => {
    try {
      await CompanionService.StartSession(race.id, selectedEventID);
      setPairing(null);
      await load();
    } catch (e) { setError(String(e)); }
  };

  const createPairing = async () => {
    if (!state?.session) return;
    try { setPairing(await CompanionService.CreatePairing(state.session.id)); setError(''); }
    catch (e) { setError(String(e)); }
  };

  const stopSession = async () => {
    if (!state?.session || !window.confirm('Stop this companion session and disconnect every phone?')) return;
    await CompanionService.StopSession(state.session.id);
    setPairing(null); setState(null);
  };

  const roleColor = (role: string) => role === 'timer' ? 'var(--success)' : role === 'bib' ? 'var(--accent)' : 'var(--warning)';

  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--space-lg)' }}>
    <div className="flex-between">
      <div><h1 style={{ marginBottom: 4 }}>Phone Companion</h1><div className="text-dim">Secure phone timing and bib entry for {race.name}</div></div>
      {state?.session ? <button style={{ background: 'var(--danger)' }} onClick={stopSession}>Stop Session</button> : <div style={{ display: 'flex', alignItems: 'end', gap: 10 }}><label style={{ minWidth: 240 }}><span className="text-dim" style={{ display: 'block', marginBottom: 4 }}>RECORDING SCOPE</span><select value={selectedEventID} onChange={event => setSelectedEventID(Number(event.target.value))}><option value={0}>Common Chute — All Events</option>{events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label><button onClick={startSession}>Start Session</button></div>}
    </div>

    {error && <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', margin: 0 }}>{error}</div>}
    {setup?.server_error && <div className="card text-danger">HTTPS server error: {setup.server_error}</div>}

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 'var(--space-lg)' }}>
      <div className="card" style={{ margin: 0 }}>
        <h2>1. Trust this laptop</h2>
        <p className="text-dim">Required once per phone. Scan, install the Race Assistant CA, and enable full trust. Verify the fingerprint shown below.</p>
        {setup?.bootstrap_url && <div style={{ background: 'white', padding: 14, width: 'fit-content', margin: '18px auto' }}><QRCodeSVG value={setup.bootstrap_url} size={190} marginSize={2}/></div>}
        <div style={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '.78rem', color: 'var(--text-dim)' }}>{setup?.ca_fingerprint}</div>
        <div style={{ marginTop: 12, textAlign: 'center' }}><a href={setup?.bootstrap_url} target="_blank" rel="noreferrer">Open setup instructions</a></div>
      </div>

      <div className="card" style={{ margin: 0, opacity: state?.session ? 1 : .55 }}>
        <h2>2. Pair a phone</h2>
        {!state?.session ? <p>Start a session before pairing phones.</p> : <>
          <button onClick={createPairing} style={{ width: '100%' }}>Generate pairing QR and code</button>
          {pairing && <>
            <div style={{ background: 'white', padding: 14, width: 'fit-content', margin: '18px auto' }}><QRCodeSVG value={pairing.url} size={220} level="M" marginSize={2}/></div>
            <div style={{ textAlign: 'center' }}>
              <div className="text-dim" style={{ fontSize: '.8rem', fontWeight: 700, letterSpacing: '.08em' }}>OR ENTER THIS ONE-TIME CODE</div>
              <div style={{ font: '800 2.4rem monospace', letterSpacing: '.2em', margin: '8px 0' }}>{pairing.code}</div>
              <p className="text-dim">QR and code are single use · expires {new Date(pairing.expires_at_unix_ms).toLocaleTimeString()}</p>
            </div>
          </>}
        </>}
      </div>
    </div>

    {state?.session && <>
      <div className="card" style={{ margin: 0, padding: '12px 16px' }}><strong>Recording scope:</strong> {state.event_name}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--space-md)' }}>
        <div className="card" style={{ margin: 0 }}><div className="text-dim">RECORDED RACE START</div><strong style={{ fontSize: '1.4rem', color: state.race_start ? 'var(--success)' : 'var(--warning)' }}>{state.race_start ? new Date(state.race_start as unknown as string).toLocaleTimeString() : 'Waiting for start'}</strong></div>
        <div className="card" style={{ margin: 0 }}><div className="text-dim">FINISH-LINE TIMES</div><strong style={{ fontSize: '2rem' }}>{state.time_count}</strong></div>
        <div className="card" style={{ margin: 0, borderColor: state.time_count === state.bib_count ? 'var(--success)' : 'var(--warning)' }}><div className="text-dim">BIB ENTRIES</div><strong style={{ fontSize: '2rem' }}>{state.bib_count}</strong><span className="text-dim"> · difference {state.bib_count - state.time_count}</span></div>
      </div>
      <div className="table-card">
        <table><thead><tr><th>Device</th><th>Role</th><th>Last Seen</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>{state.devices.map(d => <tr key={d.id}>
            <td><strong>{d.name}</strong>{d.revoked && <span className="badge" style={{ marginLeft: 8, background: 'var(--danger)' }}>REVOKED</span>}</td>
            <td>{d.role ? <span className="badge" style={{ background: roleColor(d.role), color: 'white' }}>{d.role.toUpperCase()}</span> : '—'}</td>
            <td>{new Date(d.last_seen_at_unix_ms).toLocaleTimeString()}</td>
            <td style={{ textAlign: 'right' }}>{d.role && <button style={{ marginRight: 8, background: '#444' }} onClick={() => CompanionService.ClearRole(state.session!.id, d.role).then(load)}>Release role</button>} {!d.revoked && <button style={{ background: 'var(--danger)' }} onClick={() => CompanionService.RevokeDevice(d.id).then(load)}>Revoke</button>}</td>
          </tr>)}{state.devices.length === 0 && <tr><td colSpan={4} className="text-dim" style={{ textAlign: 'center', padding: 40 }}>No phones paired yet.</td></tr>}</tbody>
        </table>
      </div>
    </>}
  </div>;
}
