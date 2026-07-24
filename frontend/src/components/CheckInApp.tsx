import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pairingCredentialFrom } from '../utils/companionPairing';
import { PairingScanner } from './PairingScanner';
import './CompanionApp.css';
import './CompanionQueue.css';
import './CheckInApp.css';

type CheckInEvent = {
  id: number;
  name: string;
};

type CheckInParticipant = {
  id: number;
  event_id: number;
  event_name: string;
  bib_number: string;
  first_name: string;
  last_name: string;
  gender: string;
  age: number;
  shirt_size: string;
  checked_in: boolean;
};

type CheckInRoster = {
  session_id: string;
  race_name: string;
  events: CheckInEvent[];
  participants: CheckInParticipant[];
};

type ParticipantUpdate = {
  event_id: number;
  first_name: string;
  last_name: string;
  gender: string;
  age: number;
  shirt_size: string;
};

type ParticipantDraft = Omit<ParticipantUpdate, 'age'> & {
  bib_number: string;
  age: string;
};

type PendingCheckIn = {
  request_id: string;
  session_id: string;
  participant_id: number;
  bib_number: string;
  captured_at_unix_ms: number;
  participant?: ParticipantUpdate;
};

type CheckInAck = {
  request_id: string;
  status: string;
  participant: CheckInParticipant;
};

const DB_NAME = 'race-assistant-checkin';
const STORE_NAME = 'outbox';
const ROSTER_KEY = 'race-assistant-checkin-roster';
const LEGACY_QUEUE_KEY = 'race-assistant-checkin-queue';
const PAIRED_KEY = 'race-assistant-checkin-paired';
const NAME_KEY = 'race-assistant-checkin-name';

function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T;
  } catch {
    return fallback;
  }
}

function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'request_id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storedEntries(): Promise<PendingCheckIn[]> {
  const db = await openOutbox();
  const entries = await new Promise<PendingCheckIn[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return entries.sort((left, right) => left.captured_at_unix_ms - right.captured_at_unix_ms);
}

async function persistEntries(entries: PendingCheckIn[]): Promise<void> {
  const db = await openOutbox();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    entries.forEach(entry => store.put(entry));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
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

function initialPairingCredential(): string {
  return new URLSearchParams(location.hash.slice(1)).get('pair')?.trim() || '';
}

function participantWithPending(
  participant: CheckInParticipant,
  entry: PendingCheckIn,
  events: CheckInEvent[],
): CheckInParticipant {
  const update = entry.participant;
  if (!update) {
    return { ...participant, bib_number: entry.bib_number, checked_in: true };
  }
  return {
    ...participant,
    ...update,
    event_name: events.find(event => event.id === update.event_id)?.name || participant.event_name,
    bib_number: entry.bib_number,
    checked_in: true,
  };
}

function CheckInQueue({
  entries,
  roster,
  online,
  syncing,
  onSync,
  onClose,
}: {
  entries: PendingCheckIn[];
  roster: CheckInRoster | null;
  online: boolean;
  syncing: boolean;
  onSync: () => void;
  onClose: () => void;
}) {
  return (
    <div className="queue-overlay" role="dialog" aria-modal="true" aria-label="Stored check-ins">
      <div className="queue-panel">
        <div className="queue-heading">
          <div>
            <h2>Stored Check-Ins</h2>
            <p>{entries.length} unsynced {entries.length === 1 ? 'change' : 'changes'} safely stored on this device</p>
          </div>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="queue-safety">
          Entries for the current race sync automatically when the laptop is reachable. Older-race entries remain stored and blocked.
        </div>
        <div className="queue-list">
          {entries.map(entry => {
            const participant = roster?.participants.find(candidate => candidate.id === entry.participant_id);
            const update = entry.participant;
            const name = update ? `${update.first_name} ${update.last_name}` : participant
              ? `${participant.first_name} ${participant.last_name}`
              : `Participant ${entry.participant_id}`;
            const current = entry.session_id === roster?.session_id;
            return (
              <div className="queue-entry" key={entry.request_id}>
                <div>
                  <strong>{name} · Bib {entry.bib_number}</strong>
                  <span>{new Date(entry.captured_at_unix_ms).toLocaleString()}</span>
                  <small>{current ? online ? 'Current race — ready to sync' : 'Current race — waiting for laptop' : 'Older race — blocked'}</small>
                </div>
                <span className={`checkin-queue-status ${current ? 'current' : ''}`}>{current ? 'PENDING' : 'OLDER'}</span>
              </div>
            );
          })}
          {entries.length === 0 && <div className="queue-empty">All check-ins are synced.</div>}
        </div>
        <div className="queue-actions checkin-queue-actions">
          <button disabled={!online || syncing || !entries.some(entry => entry.session_id === roster?.session_id)} onClick={onSync}>
            {syncing ? 'Syncing…' : online ? 'Sync Current Race' : 'Laptop Disconnected'}
          </button>
          <button onClick={onClose}>Return to Check-In</button>
        </div>
      </div>
    </div>
  );
}

export function CheckInApp() {
  const cachedRoster = readStored<CheckInRoster | null>(ROSTER_KEY, null);
  const [roster, setRoster] = useState<CheckInRoster | null>(cachedRoster);
  const [queue, setQueueState] = useState<PendingCheckIn[]>([]);
  const [queueReady, setQueueReady] = useState(false);
  const [paired, setPaired] = useState<boolean | null>(() => localStorage.getItem(PAIRED_KEY) === '1' || cachedRoster ? true : null);
  const [online, setOnline] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || 'Check-in iPad');
  const [pairCredential, setPairCredential] = useState(initialPairingCredential);
  const [pairCode, setPairCode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showChecked, setShowChecked] = useState(false);
  const [selectedID, setSelectedID] = useState<number | null>(null);
  const [draft, setDraft] = useState<ParticipantDraft | null>(null);
  const [message, setMessage] = useState(cachedRoster ? 'SAVED ROSTER READY' : '');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const rosterRef = useRef(roster);
  const queueRef = useRef(queue);
  const flushing = useRef(false);

  const setQueue = (next: PendingCheckIn[]) => {
    queueRef.current = next;
    setQueueState(next);
  };

  const saveQueue = async (next: PendingCheckIn[]) => {
    await persistEntries(next);
    setQueue(next);
  };

  const acceptRoster = (next: CheckInRoster) => {
    const pending = queueRef.current.filter(item => item.session_id === next.session_id);
    const optimistic = new Map(pending.map(item => [item.participant_id, item]));
    const merged = {
      ...next,
      events: next.events || [],
      participants: next.participants.map(participant => {
        const entry = optimistic.get(participant.id);
        return entry ? participantWithPending(participant, entry, next.events || []) : participant;
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
    setSyncing(true);
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
          await saveQueue(queueRef.current.filter(item => item.request_id !== entry.request_id));
          setOnline(true);
          setMessage(`${ack.participant.first_name} ${ack.participant.last_name} · BIB ${ack.participant.bib_number} SYNCED`);
        } catch (error) {
          const status = (error as { status?: number }).status;
          if (status === 401) clearAuthorization();
          else if (status) {
            setMessage(String(error).replace(/^Error:\s*/, '').toUpperCase());
          } else {
            setOnline(false);
            setMessage('SAVED ON THIS DEVICE · WILL SYNC WHEN THE LAPTOP RECONNECTS');
          }
          break;
        }
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  };

  const retryAndFlush = async () => {
    setMessage('RECONNECTING TO LAPTOP…');
    if (await refreshRoster()) {
      await flush();
      if (queueRef.current.filter(entry => entry.session_id === rosterRef.current?.session_id).length === 0) {
        setMessage('CONNECTED · ALL CHECK-INS SYNCED');
      }
    } else {
      setMessage('LAPTOP DISCONNECTED · CHANGES WILL REMAIN ON THIS DEVICE');
    }
  };

  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  useEffect(() => {
    let stopped = false;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/checkin-sw.js', { scope: '/checkin/' }).then(registration => registration.update()).catch(() => {});
      navigator.storage?.persist?.().catch(() => {});
    }
    const initialise = async () => {
      try {
        const indexedEntries = await storedEntries();
        const legacyEntries = readStored<PendingCheckIn[]>(LEGACY_QUEUE_KEY, []);
        const combined = new Map(indexedEntries.map(entry => [entry.request_id, entry]));
        legacyEntries.forEach(entry => combined.set(entry.request_id, entry));
        const entries = [...combined.values()];
        if (legacyEntries.length > 0) {
          await persistEntries(entries);
          localStorage.removeItem(LEGACY_QUEUE_KEY);
        }
        if (stopped) return;
        setQueue(entries);
      } catch {
        if (!stopped) setMessage('LOCAL STORAGE COULD NOT BE OPENED');
      } finally {
        if (!stopped) setQueueReady(true);
      }
      if (!stopped) {
        const connected = await refreshRoster();
        if (connected) await flush();
      }
    };
    void initialise();
    const timer = window.setInterval(() => {
      if (localStorage.getItem(PAIRED_KEY) === '1') {
        void refreshRoster().then(connected => {
          if (connected) void flush();
        });
      }
    }, 2500);
    const reconnect = () => void retryAndFlush();
    addEventListener('online', reconnect);
    return () => {
      stopped = true;
      clearInterval(timer);
      removeEventListener('online', reconnect);
    };
  }, []);

  const acceptPairingScan = useCallback((value: string) => {
    const credential = pairingCredentialFrom(value, location.origin, '/checkin/');
    setPairCredential(credential);
    setPairCode('');
    setScannerOpen(false);
    setMessage('CHECK-IN QR SCANNED · NAME THIS DEVICE AND PAIR');
  }, []);

  const pair = async (credential = pairCredential || pairCode) => {
    if (!credential.trim() || busy) return;
    setBusy(true);
    setMessage('PAIRING…');
    try {
      const token = pairingCredentialFrom(credential, location.origin, '/checkin/');
      await api('/api/companion/pair', {
        method: 'POST',
        body: JSON.stringify({ token, name: name.trim() || 'Check-in iPad', mode: 'checkin' }),
      });
      localStorage.setItem(NAME_KEY, name.trim() || 'Check-in iPad');
      localStorage.setItem(PAIRED_KEY, '1');
      history.replaceState(null, '', location.pathname);
      setPairCredential('');
      setPairCode('');
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

  const shirtSizes = useMemo(() => {
    const values = new Set((roster?.participants || []).map(participant => participant.shirt_size).filter(Boolean));
    return [...values].sort((left, right) => left.localeCompare(right));
  }, [roster]);

  const choose = (participant: CheckInParticipant) => {
    setSelectedID(participant.id);
    setDraft({
      event_id: participant.event_id,
      bib_number: participant.bib_number,
      first_name: participant.first_name,
      last_name: participant.last_name,
      gender: participant.gender === 'M' || participant.gender === 'F' ? participant.gender : 'N/A',
      age: participant.age.toString(),
      shirt_size: participant.shirt_size || '',
    });
    setMessage('');
  };

  const checkIn = async () => {
    if (!roster || !selected || !draft) return;
    const normalizedBib = draft.bib_number.trim();
    const firstName = draft.first_name.trim();
    const lastName = draft.last_name.trim();
    if (!normalizedBib) {
      setMessage('ENTER A BIB NUMBER');
      return;
    }
    if (!firstName || !lastName) {
      setMessage('FIRST AND LAST NAME ARE REQUIRED');
      return;
    }
    if (!roster.events.some(event => event.id === draft.event_id)) {
      setMessage('SELECT AN EVENT');
      return;
    }
    const age = Number.parseInt(draft.age, 10);
    if (!/^\d+$/.test(draft.age) || age < 0 || age > 130) {
      setMessage('ENTER AN AGE BETWEEN 0 AND 130');
      return;
    }
    const conflict = roster.participants.find(participant => participant.id !== selected.id && participant.bib_number === normalizedBib);
    if (conflict) {
      setMessage(`BIB ${normalizedBib} BELONGS TO ${conflict.first_name} ${conflict.last_name}`.toUpperCase());
      return;
    }
    const participant: ParticipantUpdate = {
      event_id: draft.event_id,
      first_name: firstName,
      last_name: lastName,
      gender: draft.gender,
      age,
      shirt_size: draft.shirt_size.trim(),
    };
    const entry: PendingCheckIn = {
      request_id: uuid(),
      session_id: roster.session_id,
      participant_id: selected.id,
      bib_number: normalizedBib,
      captured_at_unix_ms: Date.now(),
      participant,
    };
    const nextQueue = [
      ...queueRef.current.filter(item => !(item.session_id === roster.session_id && item.participant_id === selected.id)),
      entry,
    ];
    try {
      await saveQueue(nextQueue);
    } catch {
      setMessage('COULD NOT STORE THIS CHECK-IN ON THE DEVICE');
      return;
    }
    applyParticipant(participantWithPending(selected, entry, roster.events));
    setSelectedID(null);
    setDraft(null);
    setQuery('');
    setMessage(`${firstName} ${lastName} · BIB ${normalizedBib} SAVED ON THIS DEVICE`);
    void flush();
  };

  if (paired === null || !queueReady) {
    return <div className="companion-shell companion-center">Opening saved check-in…</div>;
  }

  const queuePanel = queueOpen
    ? <CheckInQueue entries={queue} roster={roster} online={online} syncing={syncing} onSync={() => void retryAndFlush()} onClose={() => setQueueOpen(false)} />
    : null;

  if (!paired) {
    return (
      <div className="companion-shell companion-center">
        {scannerOpen && <PairingScanner onScan={acceptPairingScan} onClose={() => setScannerOpen(false)} />}
        <div className="companion-card pairing-card">
          <h1>Race Assistant Check-In</h1>
          <p>Pair this browser or installed app with the current pre-race check-in session.</p>
          {!online && <div className="connection-warning"><strong>Race Assistant is unreachable</strong><span>Confirm this device is on the laptop network, then retry or scan the current check-in QR.</span><button onClick={() => void retryAndFlush()}>Retry Connection</button></div>}
          <label className="pair-label">STATION NAME<input value={name} onChange={event => setName(event.target.value)} placeholder="Check-in iPad 1" autoComplete="off" /></label>
          {pairCredential ? <>
            <div className="pair-ready">✓ Check-in pairing QR ready</div>
            <button disabled={busy} onClick={() => void pair()}>{busy ? 'Pairing…' : 'Pair This Check-In Station'}</button>
            <button className="pair-secondary" disabled={busy} onClick={() => { setPairCredential(''); setMessage(''); }}>Use a different pairing method</button>
          </> : <>
            <button className="pair-camera" onClick={() => { setMessage(''); setScannerOpen(true); }}>Scan Check-In QR with Camera</button>
            <div className="pair-divider"><span>OR</span></div>
            <form onSubmit={event => { event.preventDefault(); void pair(pairCode); }}>
              <label className="pair-label">ONE-TIME NUMERIC CODE<input className="pair-code" inputMode="numeric" pattern="[0-9]*" maxLength={8} placeholder="00000000" value={pairCode} onChange={event => setPairCode(event.target.value.replace(/\D/g, '').slice(0, 8))} autoComplete="one-time-code" /></label>
              <button disabled={busy || pairCode.length < 6}>{busy ? 'Pairing…' : 'Pair with Code'}</button>
            </form>
          </>}
          {queue.length > 0 && <><p className="companion-message warning">{queue.length} unsynced check-in {queue.length === 1 ? 'change remains' : 'changes remain'} safely stored on this device.</p><button onClick={() => setQueueOpen(true)}>Review Stored Check-Ins</button></>}
          <div className="companion-message">{message}</div>
        </div>
        {queuePanel}
      </div>
    );
  }

  const checkedCount = roster?.participants.filter(participant => participant.checked_in).length || 0;
  const errorMessage = message.includes('BELONGS') || message.includes('REQUIRED') ||
    message.includes('COULD NOT') || message.startsWith('ENTER ') || message.startsWith('SELECT ');

  return (
    <div className={`companion-shell checkin-shell ${online ? 'is-online' : 'is-offline'}`}>
      <header>
        <div>
          <strong>{roster?.race_name || 'Race Check-In'}</strong>
          <small>{online ? 'CHECK-IN · CONNECTED' : `CHECK-IN · OFFLINE · ${currentQueue.length} PENDING`}</small>
        </div>
        <div className="checkin-count"><strong>{checkedCount}</strong><span>checked in</span></div>
      </header>
      {!online && (
        <div className="checkin-offline-warning">
          <div><strong>⚠ Laptop disconnected</strong><span>Check-ins are stored safely on this device and will sync automatically when connected.</span></div>
          <button onClick={() => void retryAndFlush()}>Retry / Sync</button>
        </div>
      )}
      {online && currentQueue.length > 0 && (
        <div className="checkin-sync">
          <span>{currentQueue.length} saved {currentQueue.length === 1 ? 'change' : 'changes'} waiting to sync</span>
          <button disabled={syncing} onClick={() => void retryAndFlush()}>{syncing ? 'Syncing…' : 'Sync now'}</button>
        </div>
      )}
      <main>
        <section className="checkin-search-panel">
          <div className="checkin-search">
            <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or bib…" />
            {query && <button onClick={() => setQuery('')}>×</button>}
          </div>
          <label className="checkin-show-checked"><input type="checkbox" checked={showChecked} onChange={event => setShowChecked(event.target.checked)} /> Show already checked in</label>
          <div className="checkin-results">
            {results.map(participant => (
              <button key={participant.id} className={participant.checked_in ? 'is-checked' : ''} onClick={() => choose(participant)}>
                <span><strong>{participant.last_name}, {participant.first_name}</strong><small>{participant.event_name} · Age {participant.age} · {participant.gender || 'N/A'} · Shirt {participant.shirt_size || '—'}</small></span>
                <span className="checkin-result-bib">{pendingParticipantIDs.has(participant.id) ? 'PENDING' : participant.checked_in ? `✓ ${participant.bib_number}` : participant.bib_number || 'NO BIB'}</span>
              </button>
            ))}
            {results.length === 0 && <div className="checkin-empty">No matching participants</div>}
          </div>
        </section>
        <section className={`checkin-detail ${selected && draft ? 'is-open' : ''}`}>
          {selected && draft ? <>
            <button className="checkin-close" onClick={() => { setSelectedID(null); setDraft(null); }}>×</button>
            <div className="checkin-avatar">{draft.first_name.slice(0, 1)}{draft.last_name.slice(0, 1)}</div>
            <h2>{draft.first_name} {draft.last_name}</h2>
            {selected.checked_in && <div className="checkin-already">✓ Already checked in{pendingParticipantIDs.has(selected.id) ? ' · pending sync' : ''}</div>}
            <div className="checkin-form-grid">
              <label>FIRST NAME<input value={draft.first_name} onChange={event => setDraft({ ...draft, first_name: event.target.value })} /></label>
              <label>LAST NAME<input value={draft.last_name} onChange={event => setDraft({ ...draft, last_name: event.target.value })} /></label>
              <label className="wide">EVENT<select value={draft.event_id} onChange={event => setDraft({ ...draft, event_id: Number(event.target.value) })}>{(roster?.events || []).map(event => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
              <label>AGE<input inputMode="numeric" pattern="[0-9]*" value={draft.age} onChange={event => setDraft({ ...draft, age: event.target.value.replace(/\D/g, '') })} /></label>
              <label>GENDER<select value={draft.gender} onChange={event => setDraft({ ...draft, gender: event.target.value })}><option value="M">M</option><option value="F">F</option><option value="N/A">N/A</option></select></label>
              <label className="wide">SHIRT SIZE<input list="checkin-shirt-sizes" value={draft.shirt_size} onChange={event => setDraft({ ...draft, shirt_size: event.target.value })} placeholder="Optional" /><datalist id="checkin-shirt-sizes">{shirtSizes.map(size => <option key={size} value={size} />)}</datalist></label>
              <label className="wide checkin-bib-label">BIB NUMBER<input inputMode="numeric" value={draft.bib_number} onChange={event => setDraft({ ...draft, bib_number: event.target.value.replace(/\s/g, '') })} autoFocus /></label>
            </div>
            <button className="checkin-submit" onClick={() => void checkIn()}>{selected.checked_in ? 'Save Changes & Check In' : 'Assign Bib & Check In'}</button>
          </> : <div className="checkin-detail-empty"><div>👤</div><h2>Select a participant</h2><p>Search by first name, last name, or assigned bib.</p></div>}
        </section>
      </main>
      <footer>
        <div className={`companion-message ${errorMessage ? 'warning' : ''}`}>{message || 'READY'}</div>
        <div className="checkin-footer-actions">
          <button onClick={() => setQueueOpen(true)}>Stored Check-Ins ({queue.length})</button>
          <button disabled={!online || syncing || currentQueue.length === 0} onClick={() => void retryAndFlush()}>{syncing ? 'Syncing…' : 'Sync Now'}</button>
        </div>
      </footer>
      {queuePanel}
    </div>
  );
}
