import { useEffect, useMemo, useRef, useState } from 'react';
import './CheckInApp.css';

type CheckInParticipant = {
  id: number;
  event_id: number;
  event_name: string;
  bib_number: string;
  first_name: string;
  last_name: string;
  gender: string;
  age: number;
  checked_in: boolean;
};

type CheckInRoster = {
  session_id: string;
  race_name: string;
  participants: CheckInParticipant[];
};

type PendingCheckIn = {
  request_id: string;
  session_id: string;
  participant_id: number;
  bib_number: string;
  captured_at_unix_ms: number;
};

type CheckInAck = {
  request_id: string;
  status: string;
  participant: CheckInParticipant;
};

const ROSTER_KEY = 'race-assistant-checkin-roster';
const QUEUE_KEY = 'race-assistant-checkin-queue';
const PAIRED_KEY = 'race-assistant-checkin-paired';
const NAME_KEY = 'race-assistant-checkin-name';

function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T;
  } catch {
    return fallback;
  }
}

function uuid(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const error = new Error((await response.text()).trim() || `Request failed (${response.status})`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

function pairingCredential(): string {
  const value = new URLSearchParams(location.hash.slice(1)).get('pair') || '';
  return value.trim();
}

export function CheckInApp() {
  const cachedRoster = readStored<CheckInRoster | null>(ROSTER_KEY, null);
  const [roster, setRoster] = useState<CheckInRoster | null>(cachedRoster);
  const [queue, setQueueState] = useState<PendingCheckIn[]>(readStored(QUEUE_KEY, []));
  const [paired, setPaired] = useState<boolean | null>(() => localStorage.getItem(PAIRED_KEY) === '1' || cachedRoster ? true : null);
  const [online, setOnline] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || 'Check-in iPad');
  const [credential, setCredential] = useState(pairingCredential);
  const [query, setQuery] = useState('');
  const [showChecked, setShowChecked] = useState(false);
  const [selectedID, setSelectedID] = useState<number | null>(null);
  const [bib, setBib] = useState('');
  const [message, setMessage] = useState(cachedRoster ? 'SAVED ROSTER READY' : '');
  const [busy, setBusy] = useState(false);
  const rosterRef = useRef(roster);
  const queueRef = useRef(queue);
  const flushing = useRef(false);

  const setQueue = (next: PendingCheckIn[]) => {
    queueRef.current = next;
    setQueueState(next);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  };

  const acceptRoster = (next: CheckInRoster) => {
    const pending = queueRef.current.filter(item => item.session_id === next.session_id);
    const optimistic = new Map(pending.map(item => [item.participant_id, item]));
    const merged = {
      ...next,
      participants: next.participants.map(participant => {
        const queued = optimistic.get(participant.id);
        return queued ? { ...participant, bib_number: queued.bib_number, checked_in: true } : participant;
      }),
    };
    rosterRef.current = merged;
    setRoster(merged);
    localStorage.setItem(ROSTER_KEY, JSON.stringify(merged));
  };

  const applyParticipant = (participant: CheckInParticipant) => {
    const current = rosterRef.current;
    if (!current) return;
    acceptRoster({
      ...current,
      participants: current.participants.map(candidate => candidate.id === participant.id ? participant : candidate),
    });
  };

  const clearAuthorization = () => {
    localStorage.removeItem(PAIRED_KEY);
    setPaired(false);
    setOnline(false);
  };

  const refreshRoster = async () => {
    try {
      const next = await api<CheckInRoster>('/api/companion/checkin/roster');
      acceptRoster(next);
      localStorage.setItem(PAIRED_KEY, '1');
      setPaired(true);
      setOnline(true);
      return true;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401) clearAuthorization();
      else {
        setOnline(false);
        setPaired(current => current === null ? Boolean(rosterRef.current) : current);
      }
      return false;
    }
  };

  const flush = async () => {
    if (flushing.current || !rosterRef.current) return;
    flushing.current = true;
    try {
      while (true) {
        const currentSession = rosterRef.current?.session_id;
        const entry = queueRef.current.find(item => item.session_id === currentSession);
        if (!entry) break;
        try {
          const ack = await api<CheckInAck>('/api/companion/checkin', {
            method: 'POST',
            body: JSON.stringify(entry),
          });
          applyParticipant(ack.participant);
          setQueue(queueRef.current.filter(item => item.request_id !== entry.request_id));
          setOnline(true);
          setMessage(`${ack.participant.first_name} ${ack.participant.last_name} · BIB ${ack.participant.bib_number} SYNCED`);
        } catch (error) {
          const status = (error as { status?: number }).status;
          if (status === 401) clearAuthorization();
          else if (status) {
            setMessage(String(error).replace(/^Error:\s*/, '').toUpperCase());
          } else {
            setOnline(false);
            setMessage('SAVED ON THIS IPAD · WAITING FOR THE LAPTOP');
          }
          break;
        }
      }
    } finally {
      flushing.current = false;
    }
  };

  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/checkin-sw.js', { scope: '/checkin/' }).then(registration => registration.update()).catch(() => {});
      navigator.storage?.persist?.().catch(() => {});
    }
    void refreshRoster().then(ok => { if (ok) void flush(); });
    const timer = window.setInterval(() => {
      if (localStorage.getItem(PAIRED_KEY) === '1') {
        void refreshRoster().then(ok => { if (ok) void flush(); });
      }
    }, 4000);
    const reconnect = () => void refreshRoster().then(ok => { if (ok) void flush(); });
    addEventListener('online', reconnect);
    return () => {
      clearInterval(timer);
      removeEventListener('online', reconnect);
    };
  }, []);

  const pair = async () => {
    if (!credential.trim() || busy) return;
    setBusy(true);
    setMessage('PAIRING…');
    try {
      await api('/api/companion/pair', {
        method: 'POST',
        body: JSON.stringify({ token: credential.trim(), name: name.trim() || 'Check-in iPad', mode: 'checkin' }),
      });
      localStorage.setItem(NAME_KEY, name.trim() || 'Check-in iPad');
      localStorage.setItem(PAIRED_KEY, '1');
      history.replaceState(null, '', location.pathname);
      setCredential('');
      setPaired(true);
      if (await refreshRoster()) {
        setMessage('CHECK-IN READY');
        await flush();
      }
    } catch (error) {
      setMessage(String(error).replace(/^Error:\s*/, '').toUpperCase());
    } finally {
      setBusy(false);
    }
  };

  const currentQueue = roster ? queue.filter(item => item.session_id === roster.session_id) : [];
  const pendingParticipantIDs = new Set(currentQueue.map(item => item.participant_id));
  const selected = roster?.participants.find(participant => participant.id === selectedID) || null;
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!roster) return [];
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return roster.participants
      .filter(participant => showChecked || normalizedQuery !== '' || !participant.checked_in || pendingParticipantIDs.has(participant.id))
      .filter(participant => {
        if (terms.length === 0) return true;
        const searchable = `${participant.first_name} ${participant.last_name} ${participant.bib_number}`.toLowerCase();
        return terms.every(term => searchable.includes(term));
      })
      .slice(0, 80);
  }, [roster, normalizedQuery, showChecked, queue]);

  const choose = (participant: CheckInParticipant) => {
    setSelectedID(participant.id);
    setBib(participant.bib_number);
    setMessage('');
  };

  const checkIn = () => {
    if (!roster || !selected) return;
    const normalizedBib = bib.trim();
    if (!normalizedBib) {
      setMessage('ENTER A BIB NUMBER');
      return;
    }
    const conflict = roster.participants.find(participant => participant.id !== selected.id && participant.bib_number === normalizedBib);
    if (conflict) {
      setMessage(`BIB ${normalizedBib} BELONGS TO ${conflict.first_name} ${conflict.last_name}`.toUpperCase());
      return;
    }
    const entry: PendingCheckIn = {
      request_id: uuid(),
      session_id: roster.session_id,
      participant_id: selected.id,
      bib_number: normalizedBib,
      captured_at_unix_ms: Date.now(),
    };
    setQueue([...queueRef.current.filter(item => !(item.session_id === roster.session_id && item.participant_id === selected.id)), entry]);
    applyParticipant({ ...selected, bib_number: normalizedBib, checked_in: true });
    setSelectedID(null);
    setBib('');
    setQuery('');
    setMessage(`${selected.first_name} ${selected.last_name} · BIB ${normalizedBib} SAVED`);
    void flush();
  };

  if (paired === null) return <div className="checkin-shell checkin-center">Opening saved check-in…</div>;

  if (!paired) return (
    <div className="checkin-shell checkin-center">
      <section className="checkin-pair-card">
        <div className="checkin-mark">✓</div>
        <h1>Race Assistant Check-In</h1>
        <p>Scan the check-in QR on the laptop, or enter its one-time numeric code.</p>
        <label>STATION NAME<input value={name} onChange={event => setName(event.target.value)} placeholder="Check-in iPad 1" /></label>
        <label>ONE-TIME CODE<input className="checkin-code" inputMode="numeric" value={credential} onChange={event => setCredential(event.target.value.replace(/\D/g, '').slice(0, 64))} placeholder="00000000" /></label>
        <button disabled={busy || credential.length < 8} onClick={pair}>{busy ? 'Pairing…' : 'Pair This Check-In Station'}</button>
        <div className="checkin-message">{message}</div>
      </section>
    </div>
  );

  const checkedCount = roster?.participants.filter(participant => participant.checked_in).length || 0;
  return (
    <div className={`checkin-shell ${online ? 'is-online' : 'is-offline'}`}>
      <header>
        <div><strong>{roster?.race_name || 'Race Check-In'}</strong><small>{online ? 'CONNECTED TO LAPTOP' : 'LOCAL ROSTER · LAPTOP DISCONNECTED'}</small></div>
        <div className="checkin-count"><strong>{checkedCount}</strong><span>checked in</span></div>
      </header>
      {currentQueue.length > 0 && <div className="checkin-sync"><span>{currentQueue.length} saved change{currentQueue.length === 1 ? '' : 's'} waiting to sync</span><button onClick={() => void refreshRoster().then(ok => { if (ok) void flush(); })}>Sync now</button></div>}
      <main>
        <section className="checkin-search-panel">
          <div className="checkin-search">
            <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or bib…" />
            {query && <button onClick={() => setQuery('')}>×</button>}
          </div>
          <label className="checkin-show-checked"><input type="checkbox" checked={showChecked} onChange={event => setShowChecked(event.target.checked)} /> Show already checked in</label>
          <div className="checkin-results">
            {results.map(participant => <button key={participant.id} className={participant.checked_in ? 'is-checked' : ''} onClick={() => choose(participant)}>
              <span><strong>{participant.last_name}, {participant.first_name}</strong><small>{participant.event_name} · Age {participant.age} · {participant.gender || '—'}</small></span>
              <span className="checkin-result-bib">{pendingParticipantIDs.has(participant.id) ? 'PENDING' : participant.checked_in ? `✓ ${participant.bib_number}` : participant.bib_number || 'NO BIB'}</span>
            </button>)}
            {results.length === 0 && <div className="checkin-empty">No matching participants</div>}
          </div>
        </section>
        <section className={`checkin-detail ${selected ? 'is-open' : ''}`}>
          {selected ? <>
            <button className="checkin-close" onClick={() => setSelectedID(null)}>×</button>
            <div className="checkin-avatar">{selected.first_name.slice(0, 1)}{selected.last_name.slice(0, 1)}</div>
            <h2>{selected.first_name} {selected.last_name}</h2>
            <div className="checkin-facts">
              <div><span>Event</span><strong>{selected.event_name}</strong></div>
              <div><span>Age</span><strong>{selected.age}</strong></div>
              <div><span>Gender</span><strong>{selected.gender || '—'}</strong></div>
              <div><span>Shirt</span><strong className="text-dim">Not tracked</strong></div>
            </div>
            {selected.checked_in && <div className="checkin-already">✓ Already checked in{pendingParticipantIDs.has(selected.id) ? ' · pending sync' : ''}</div>}
            <label className="checkin-bib-label">BIB NUMBER<input inputMode="numeric" value={bib} onChange={event => setBib(event.target.value.replace(/\s/g, ''))} autoFocus /></label>
            <button className="checkin-submit" onClick={checkIn}>{selected.checked_in ? 'Update Bib & Check-In' : 'Assign Bib & Check In'}</button>
          </> : <div className="checkin-detail-empty"><div>👤</div><h2>Select a participant</h2><p>Search by first name, last name, or assigned bib.</p></div>}
        </section>
      </main>
      <footer className={message.includes('BELONGS') || message.includes('ERROR') ? 'is-error' : ''}>{message || 'READY'}</footer>
    </div>
  );
}
