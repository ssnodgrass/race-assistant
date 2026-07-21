import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Calibration, correctCapture, formatElapsedHundredths, selectCalibration } from '../utils/companionClock';
import { pairingCredentialFrom } from '../utils/companionPairing';
import './CompanionApp.css';
import './CompanionQueue.css';

type Role = 'start' | 'timer' | 'bib';
type Entry = { request_id: string; session_id:string; kind: 'start'|'time'|'bib'; captured_at_unix_ms: number; client_captured_at_unix_ms:number; calibration_at_unix_ms:number; calibration_offset_ms:number; bib_number: string; uncertainty_ms: number };
type Ack = { request_id:string; status:string; place:number; elapsed:string; bib_number:string; participant_name:string; event_name:string; warning:string };
type DisplayAck = Ack & { kind:Entry['kind'] };
type State = { session:{id:string}|null; race_name:string; event_name:string; race_start:string|null; time_count:number; bib_count:number; next_time_place:number; next_bib_place:number; devices:Array<{id:string;name:string;role:string}> };

const DB_NAME = 'race-assistant-companion';
const STORE = 'outbox';
const STATE_KEY = 'companion-state';
const PAIRED_KEY = 'companion-paired';
const ROLE_KEY = 'companion-held-role';

function storedState():State|null { try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null')}catch{return null} }
function storedRole():Role|null { const role=localStorage.getItem(ROLE_KEY);return role==='start'||role==='timer'||role==='bib'?role:null }
function storedDeviceName():string { const saved=localStorage.getItem('companion-name')||'';return saved==='Race phone'?'' : saved }

function PairingScanner({onScan,onClose}:{onScan:(value:string)=>void;onClose:()=>void}) {
  const videoRef=useRef<HTMLVideoElement>(null);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [error,setError]=useState('Starting camera…');

  useEffect(()=>{
    let stream:MediaStream|undefined;
    let frame=0;
    let finished=false;
    let lastScan=0;
    const stop=()=>{finished=true;if(frame)cancelAnimationFrame(frame);stream?.getTracks().forEach(track=>track.stop())};
    const scan=(timestamp:number)=>{
      if(finished)return;
      const video=videoRef.current;
      const canvas=canvasRef.current;
      if(video&&canvas&&video.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA&&timestamp-lastScan>=140){
        lastScan=timestamp;
        const scale=Math.min(1,720/video.videoWidth);
        canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
        canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
        const context=canvas.getContext('2d',{willReadFrequently:true});
        if(context){
          context.drawImage(video,0,0,canvas.width,canvas.height);
          const pixels=context.getImageData(0,0,canvas.width,canvas.height);
          const result=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'dontInvert'});
          if(result){
            try{onScan(result.data);stop();return}catch(e){setError(String(e).replace(/^Error:\s*/,''))}
          }
        }
      }
      frame=requestAnimationFrame(scan);
    };
    const start=async()=>{
      if(!navigator.mediaDevices?.getUserMedia){setError('Camera scanning is not supported here. Enter the pairing code instead.');return}
      try{
        stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
        if(finished){stream.getTracks().forEach(track=>track.stop());return}
        const video=videoRef.current;
        if(!video)return;
        video.srcObject=stream;
        await video.play();
        setError('Point the camera at the pairing QR on the laptop.');
        frame=requestAnimationFrame(scan);
      }catch(e){
        const denied=(e as DOMException).name==='NotAllowedError';
        setError(denied?'Camera permission was denied. Allow camera access or enter the pairing code.':'The camera could not start. Enter the pairing code instead.');
      }
    };
    void start();
    return stop;
  },[onScan]);

  return <div className="pair-scanner" role="dialog" aria-modal="true" aria-label="Scan pairing QR">
    <div className="pair-scanner-panel">
      <h2>Scan Pairing QR</h2>
      <div className="pair-video-wrap"><video ref={videoRef} muted playsInline autoPlay/><div className="pair-scan-target"/></div>
      <canvas ref={canvasRef} hidden/>
      <p className="pair-help">{error}</p>
      <button onClick={onClose}>Cancel Camera</button>
    </div>
  </div>;
}

function LocalQueue({entries,currentSessionID,paired,onClose,onDelete,onClear}:{entries:Entry[];currentSessionID?:string;paired:boolean;onClose:()=>void;onDelete:(entry:Entry)=>void;onClear:(scope:'older'|'all')=>void}) {
  const olderCount=entries.filter(entry=>entry.session_id!==currentSessionID).length;
  const kindLabel=(entry:Entry)=>entry.kind==='start'?'Official Start':entry.kind==='time'?'Finish Time':entry.bib_number==='__GENERIC__'?'Excluded Finish':`Bib ${entry.bib_number||'?'}`;
  return <div className="queue-overlay" role="dialog" aria-modal="true" aria-label="Local queue">
    <div className="queue-panel">
      <div className="queue-heading"><div><h2>Local Queue</h2><p>{entries.length} unsent {entries.length===1?'entry':'entries'} stored on this phone</p></div><button onClick={onClose}>Close</button></div>
      <div className="queue-safety">Only entries matching the currently paired session are eligible to sync. Older-session entries are blocked unless explicitly deleted here.</div>
      <div className="queue-list">{entries.map(entry=>{
        const isCurrent=Boolean(currentSessionID)&&entry.session_id===currentSessionID;
        const status=isCurrent&&paired?'Current session — eligible to sync':isCurrent?'Last known session — not syncing while unpaired':'Older session — blocked';
        return <div className="queue-entry" key={entry.request_id}>
          <div><strong>{kindLabel(entry)}</strong><span>{new Date(entry.captured_at_unix_ms).toLocaleString()}</span><small>{status} · Session {entry.session_id?.slice(0,8)||'legacy'}</small></div>
          <button onClick={()=>onDelete(entry)}>Delete</button>
        </div>;
      })}{entries.length===0&&<div className="queue-empty">The local queue is empty.</div>}</div>
      <div className="queue-actions"><button disabled={olderCount===0} onClick={()=>onClear('older')}>Delete Older Sessions ({olderCount})</button><button className="danger" disabled={entries.length===0} onClick={()=>onClear('all')}>Delete All Queued Entries</button></div>
    </div>
  </div>;
}

function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'request_id' });
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
async function putEntry(entry: Entry) { const db=await openOutbox(); await new Promise<void>((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(entry);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)});db.close(); }
async function deleteEntry(id:string) { const db=await openOutbox();await new Promise<void>((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)});db.close(); }
async function allEntries():Promise<Entry[]> { const db=await openOutbox();const out=await new Promise<Entry[]>((res,rej)=>{const q=db.transaction(STORE).objectStore(STORE).getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});db.close();return out; }
const uuid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const nowClientEpoch = () => performance.timeOrigin + performance.now();

export function CompanionApp() {
  const [state,setState]=useState<State|null>(storedState);
  const [paired,setPaired]=useState<boolean|null>(()=>localStorage.getItem(PAIRED_KEY)==='true'?true:null);
  const [name,setName]=useState(storedDeviceName);
  const [pairCredential,setPairCredential]=useState(new URLSearchParams(location.hash.slice(1)).get('pair')||'');
  const [pairCode,setPairCode]=useState('');
  const [scannerOpen,setScannerOpen]=useState(false);
  const [pairingBusy,setPairingBusy]=useState(false);
  const [active,setActive]=useState<Role>(()=>storedRole()||'timer');
  const [heldRole,setHeldRole]=useState<Role|null>(storedRole);
  const [cal,setCal]=useState<Calibration|null>(()=>{try{return JSON.parse(localStorage.getItem('companion-calibration')||'null')}catch{return null}});
  const [pending,setPending]=useState(0);
  const [orphaned,setOrphaned]=useState(0);
  const [queuedEntries,setQueuedEntries]=useState<Entry[]>([]);
  const [queueOpen,setQueueOpen]=useState(false);
  const [online,setOnline]=useState(false);
  const [message,setMessage]=useState('');
  const [lastAck,setLastAck]=useState<DisplayAck|null>(null);
  const [bib,setBib]=useState('');
  const [armed,setArmed]=useState(false);
  const [tick,setTick]=useState(Date.now());
  const armTimer=useRef<number>();
  const flushing=useRef(false);
  const startCapturePending=useRef(false);
  const pairedRef=useRef(paired===true);
  const calRef=useRef<Calibration|null>(cal);
  const stateRef=useRef<State|null>(state);
  const lastServerContact=useRef(0);
  const lastReconnectAttempt=useRef(0);

  const api=async(path:string,init?:RequestInit)=>{
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),4000);
    try{
      const response=await fetch(path,{...init,signal:init?.signal||controller.signal,credentials:'same-origin',headers:{'Content-Type':'application/json',...(init?.headers||{})}});
      lastServerContact.current=Date.now();
      setOnline(true);
      if(!response.ok){const error=new Error(await response.text()||response.statusText) as Error & {status:number};error.status=response.status;throw error}
      return response.status===204?null:response.json();
    }finally{clearTimeout(timeout)}
  };

  const refreshPending=async()=>{const entries=(await allEntries()).sort((left,right)=>left.client_captured_at_unix_ms-right.client_captured_at_unix_ms);const sessionID=stateRef.current?.session?.id;setQueuedEntries(entries);setPending(entries.filter(entry=>entry.session_id===sessionID).length);setOrphaned(entries.filter(entry=>entry.session_id!==sessionID).length)};
  const acceptState=(data:State)=>{lastServerContact.current=Date.now();stateRef.current=data;setState(data);localStorage.setItem(STATE_KEY,JSON.stringify(data));localStorage.setItem(PAIRED_KEY,'true');setPaired(true);pairedRef.current=true;setOnline(true);void refreshPending()};
  const clearAuthorization=()=>{pairedRef.current=false;setPaired(false);localStorage.removeItem(PAIRED_KEY);localStorage.removeItem(ROLE_KEY);setHeldRole(null)};
  const loadState=async()=>{try{acceptState(await api('/api/companion/state'));return true}catch(e){const status=(e as {status?:number}).status;if(status===401)clearAuthorization();else if(!status){setOnline(false);if(!pairedRef.current)setPaired(false)}return false}};

  const calibrate=async()=>{
    const samples:{offset:number;rtt:number}[]=[];
    for(let i=0;i<7;i++){
      const t0=nowClientEpoch();const data=await api('/api/companion/clock');const t3=nowClientEpoch();
      const offset=((data.server_receive_unix_ms-t0)+(data.server_send_unix_ms-t3))/2;
      samples.push({offset,rtt:(t3-t0)-(data.server_send_unix_ms-data.server_receive_unix_ms)});
    }
    const next=selectCalibration(samples);
    setCal(next);calRef.current=next;localStorage.setItem('companion-calibration',JSON.stringify(next));return next;
  };

  const flush=async()=>{
    if(flushing.current||!pairedRef.current)return;
    flushing.current=true;
    try{
      const sessionID=stateRef.current?.session?.id;
      if(!sessionID){await loadState();return}
      const queued=(await allEntries()).filter(entry=>entry.session_id===sessionID).sort(
        (left,right)=>left.client_captured_at_unix_ms-right.client_captured_at_unix_ms,
      );
      let post=calRef.current;
      if(queued.length && (!post || Date.now()-post.at>60000)) post=await calibrate();
      for(let entry of queued){
        if(post) entry=correctCapture(entry,post);
        let data;
        try{
          data=await api('/api/companion/entries',{method:'POST',body:JSON.stringify({entries:[entry]})});
        }catch(e){
          if(entry.kind==='start'&&(e as {status?:number}).status===409){
            await loadState();
            if(stateRef.current?.race_start){
              await deleteEntry(entry.request_id);startCapturePending.current=false;setHeldRole(null);localStorage.removeItem(ROLE_KEY);setMessage('OFFICIAL START ALREADY RECORDED · EXTRA START TAP DISCARDED');continue;
            }
          }
          throw e;
        }
        const ack=data.acks[0] as Ack;await deleteEntry(entry.request_id);setLastAck({...ack,kind:entry.kind});setMessage(entry.kind==='start'?'OFFICIAL START RECORDED · ROLE RELEASED':ack.warning?ack.warning.toUpperCase():'RECORDED');
        if(entry.kind==='start'){startCapturePending.current=false;setHeldRole(null);localStorage.removeItem(ROLE_KEY)}
      }
      await refreshPending();await loadState();
    }catch(e){const status=(e as {status?:number}).status;if(!status){setOnline(false);setMessage('SAVED OFFLINE · WAITING FOR LAPTOP')}else{setMessage(`QUEUED · ${String(e)}`)}}finally{flushing.current=false}
  };

  useEffect(()=>{history.replaceState(null,'',location.pathname);let refreshing=false;const reloadForUpdate=()=>{if(!refreshing){refreshing=true;location.reload()}};if('serviceWorker'in navigator){const hadController=Boolean(navigator.serviceWorker.controller);if(hadController)navigator.serviceWorker.addEventListener('controllerchange',reloadForUpdate);navigator.serviceWorker.register('/companion-sw.js',{scope:'/companion/'}).then(registration=>registration.update()).catch(()=>{});navigator.storage?.persist?.().catch(()=>{})}lastReconnectAttempt.current=Date.now();loadState();refreshPending();const reconnect=()=>{lastReconnectAttempt.current=Date.now();if(pairedRef.current)void flush();else void loadState()};const timer=setInterval(()=>{const now=Date.now();if(now-lastServerContact.current>3500){setOnline(false);if(now-lastReconnectAttempt.current>4000)reconnect()}},1000);const on=()=>reconnect();addEventListener('online',on);return()=>{clearInterval(timer);removeEventListener('online',on);navigator.serviceWorker?.removeEventListener('controllerchange',reloadForUpdate)}},[]);
  useEffect(()=>{if(!paired)return;const stream=new EventSource('/api/companion/events',{withCredentials:true});const receiveState=(event:MessageEvent)=>{try{acceptState(JSON.parse(event.data) as State)}catch{setOnline(false)}};const serverEvent=()=>{lastServerContact.current=Date.now();setOnline(true)};const unauthorized=()=>{serverEvent();stream.close();clearAuthorization()};stream.addEventListener('state',receiveState as EventListener);stream.addEventListener('unauthorized',unauthorized);stream.addEventListener('unavailable',()=>{serverEvent();setMessage('COMPANION SESSION UNAVAILABLE')});stream.onerror=()=>{if(Date.now()-lastServerContact.current>3500)setOnline(false)};return()=>stream.close()},[paired]);
  useEffect(()=>{if(paired)calibrate().catch(()=>{});},[paired]);
  useEffect(()=>{const timer=setInterval(()=>setTick(Date.now()),50);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!heldRole||!('wakeLock'in navigator))return;let lock:any;(navigator as any).wakeLock.request('screen').then((v:any)=>lock=v).catch(()=>{});return()=>lock?.release()},[heldRole]);

  const acceptPairingScan=useCallback((value:string)=>{const credential=pairingCredentialFrom(value);setPairCredential(credential);setPairCode('');setScannerOpen(false);setMessage('PAIRING QR SCANNED · NAME THIS DEVICE AND PAIR')},[]);
  const pair=async(credential=pairCredential||pairCode)=>{if(pairingBusy)return;try{setPairingBusy(true);setMessage('PAIRING…');const data=await api('/api/companion/pair',{method:'POST',body:JSON.stringify({token:pairingCredentialFrom(credential),name})});localStorage.setItem('companion-name',name);acceptState(data);setMessage('PAIRED');await refreshPending();await calibrate()}catch(e){setMessage(String(e).replace(/^Error:\s*/,''))}finally{setPairingBusy(false)}};
  const retryConnection=async()=>{setMessage('RECONNECTING…');if(await loadState()){setMessage('CONNECTED');if(pairedRef.current){calibrate().catch(()=>{});void flush()}}else setMessage(`CANNOT REACH ${location.host}`)};
  const acquire=async(role:Role)=>{try{await api(`/api/companion/role/${role}`,{method:'PUT'});localStorage.setItem(ROLE_KEY,role);setHeldRole(role);setActive(role);if(role==='start'){setArmed(false);setMessage('START RESERVED · CALIBRATING…');try{await calibrate();setMessage('START READY · SAFE TO LEAVE WI-FI')}catch{setOnline(false);setMessage('START RESERVED · RECONNECT TO CALIBRATE')}}else setMessage(`${role.toUpperCase()} READY`)}catch(e){setMessage(String(e))}};
  const release=async()=>{if(!heldRole||pending)return;await api(`/api/companion/role/${heldRole}`,{method:'DELETE'});localStorage.removeItem(ROLE_KEY);setHeldRole(null);setArmed(false);setMessage('ROLE RELEASED')};

  const capture=async(kind:Entry['kind'],bibNumber='')=>{
    const current=cal;
    if(!current||Date.now()-current.at>30*60*1000){setMessage('CLOCK CALIBRATION EXPIRED — RECONNECT');return}
    if(current.uncertainty>100){setMessage('CLOCK UNCERTAINTY TOO HIGH — RECALIBRATE');return}
    const sessionID=stateRef.current?.session?.id;
    if(!sessionID){setMessage('NO ACTIVE COMPANION SESSION');return}
    if(kind==='start'){
      if(stateRef.current?.race_start){setMessage('OFFICIAL START IS ALREADY RECORDED');return}
      const existing=(await allEntries()).some(entry=>entry.session_id===sessionID&&entry.kind==='start');
      if(startCapturePending.current||existing){startCapturePending.current=true;setMessage('START ALREADY SAVED · WAITING FOR LAPTOP');return}
      startCapturePending.current=true;
    }
    const clientAt=nowClientEpoch();
    const entry:Entry={request_id:uuid(),session_id:sessionID,kind,captured_at_unix_ms:Math.round(clientAt+current.offset),client_captured_at_unix_ms:Math.round(clientAt),calibration_at_unix_ms:current.at,calibration_offset_ms:current.offset,bib_number:bibNumber,uncertainty_ms:current.uncertainty};
    try{await putEntry(entry)}catch(e){if(kind==='start')startCapturePending.current=false;throw e}await refreshPending();setMessage(online?'SAVED LOCALLY · SYNCING…':'SAVED OFFLINE · WAITING FOR LAPTOP');if(navigator.vibrate)navigator.vibrate(35);void flush();
  };
  const submitBib=async(value=bib)=>{if(!value.trim())return;await capture('bib',value.trim());setBib('')};
  const undo=async()=>{if(!lastAck)return;try{await api(`/api/companion/undo/${lastAck.request_id}`,{method:'POST'});setMessage(`UNDID PLACE ${lastAck.place}`);setLastAck(null);await loadState()}catch(e){setMessage(String(e))}};
  const deleteQueuedEntry=async(entry:Entry)=>{if(!window.confirm(`Delete this unsent ${entry.kind==='time'?'finish time':entry.kind} entry from the phone?`))return;await deleteEntry(entry.request_id);if(entry.kind==='start')startCapturePending.current=false;setMessage('LOCAL QUEUE ENTRY DELETED');await refreshPending()};
  const clearQueuedEntries=async(scope:'older'|'all')=>{const sessionID=stateRef.current?.session?.id;const targets=queuedEntries.filter(entry=>scope==='all'||entry.session_id!==sessionID);if(!targets.length||!window.confirm(`Permanently delete ${targets.length} unsent ${targets.length===1?'entry':'entries'} from this phone?`))return;for(const entry of targets)await deleteEntry(entry.request_id);if(targets.some(entry=>entry.kind==='start'))startCapturePending.current=false;setMessage('LOCAL QUEUE CLEARED');await refreshPending()};

  const elapsed=useMemo(()=>state?.race_start?formatElapsedHundredths(tick-new Date(state.race_start).getTime()):'WAITING FOR START',[state?.race_start,tick]);
  const visibleAck=lastAck&&((lastAck.kind==='time'?'timer':lastAck.kind)===active)?lastAck:null;
  const visibleAckValue=visibleAck?.bib_number.startsWith('GP:')?'Excluded finish':visibleAck?.bib_number||visibleAck?.elapsed;

  if(paired===null)return <div className="companion-shell companion-center">Connecting…</div>;
  const queuePanel=queueOpen?<LocalQueue entries={queuedEntries} currentSessionID={state?.session?.id} paired={paired===true} onClose={()=>setQueueOpen(false)} onDelete={deleteQueuedEntry} onClear={clearQueuedEntries}/>:null;

  if(!paired)return <div className="companion-shell companion-center">
    {scannerOpen&&<PairingScanner onScan={acceptPairingScan} onClose={()=>setScannerOpen(false)}/>}
    <div className="companion-card pairing-card">
      <h1>Race Assistant</h1>
      <p>Pair this browser or installed app with the current race session.</p>
      {!online&&<div className="connection-warning"><strong>Race Assistant is unreachable</strong><span>This app belongs to <code>{location.host}</code>. Confirm the phone is on the laptop network. If the laptop address changed, use the stable or fallback address shown on its Phone Companion screen.</span><button onClick={()=>void retryConnection()}>Retry Connection</button></div>}
      <label className="pair-label">DEVICE NAME<input value={name} placeholder="Race phone" onChange={e=>setName(e.target.value)} autoComplete="off"/></label>
      {pairCredential?<>
        <div className="pair-ready">✓ Pairing QR ready</div>
        <button disabled={pairingBusy} onClick={()=>pair()}>{pairingBusy?'Pairing…':'Pair This Device'}</button>
        <button className="pair-secondary" disabled={pairingBusy} onClick={()=>{setPairCredential('');setMessage('')}}>Use a different pairing method</button>
      </>:<>
        <button className="pair-camera" onClick={()=>{setMessage('');setScannerOpen(true)}}>Scan Pairing QR with Camera</button>
        <div className="pair-divider"><span>OR</span></div>
        <form onSubmit={event=>{event.preventDefault();void pair(pairCode)}}>
          <label className="pair-label">ONE-TIME NUMERIC CODE<input className="pair-code" inputMode="numeric" pattern="[0-9]*" maxLength={8} placeholder="00000000" value={pairCode} onChange={event=>setPairCode(event.target.value.replace(/\D/g,'').slice(0,8))} autoComplete="one-time-code"/></label>
          <button disabled={pairingBusy||pairCode.length<6}>{pairingBusy?'Pairing…':'Pair with Code'}</button>
        </form>
      </>}
      {pending+orphaned>0&&<><p className="companion-message warning">{pending+orphaned} unsent entries remain safely stored on this phone.</p><button onClick={()=>setQueueOpen(true)}>Review Local Queue</button></>}
      <div className="companion-message">{message}</div>
    </div>{queuePanel}
  </div>;

  return <div className={`companion-shell ${online?'is-online':'is-offline'}`} style={{height:'100dvh',overflow:'hidden'}}>
    {queuePanel}
    <header><div><strong>{state?.race_name}</strong><small>{state?.event_name} · {online?'CONNECTED':`OFFLINE · ${pending} PENDING`}</small></div><div className="companion-clock">{elapsed}</div></header>
    <nav>{(['start','timer','bib'] as Role[]).map(role=><button key={role} className={active===role?'active':''} onClick={()=>{if(role!==active){setMessage('');setArmed(false)}setActive(role)}}>{role==='start'?'Start':role==='timer'?'Finish Timer':'Bib Chute'}</button>)}</nav>
    {!online&&<div className="connection-warning compact"><div><strong>Server disconnected</strong><span>Captures remain stored on this device. Connected address: <code>{location.host}</code></span></div><button onClick={()=>void retryConnection()}>Retry</button></div>}
    <main style={{overflowY:'auto',flexDirection:'column',WebkitOverflowScrolling:'touch',overscrollBehavior:'contain'}}>
      {active==='start'&&state?.race_start?<section className="companion-center" style={{flex:'1 0 auto'}}><div style={{fontSize:'4rem'}}>✓</div><h2 style={{color:'#70e094',margin:0}}>Official Start Recorded</h2><div style={{font:'800 1.5rem monospace'}}>{new Date(state.race_start).toLocaleTimeString()}</div><p>The laptop accepted the official start and automatically released this phone's Start role.</p></section>:
      heldRole!==active?<div className="companion-center role-gate" style={{flex:'1 0 auto'}}><h2>{active==='start'?'Start Line':active==='timer'?'Finish Timer':'Bib Chute'}</h2><p>{online?'Acquire this exclusive role before recording. For a remote start, acquire and calibrate before leaving the laptop network.':'Role acquisition requires the laptop. Reconnect to its network, acquire Start, then leave while keeping this PWA ready.'}</p><button disabled={!online} onClick={()=>acquire(active)}>Acquire {active} role</button></div>:
      active==='start'?<section className="companion-center" style={{flex:'1 0 auto'}}><div className={`calibration ${cal&&Date.now()-cal.at<1800000&&cal.uncertainty<=50?'good':'bad'}`}>Clock uncertainty {cal?`±${Math.round(cal.uncertainty)} ms`:'unknown'}</div>{online&&<button onClick={()=>{setMessage('CALIBRATING…');calibrate().then(()=>setMessage('CLOCK READY · SAFE TO LEAVE WI-FI')).catch(()=>setMessage('CALIBRATION FAILED'))}}>Recalibrate Clock</button>}{!armed?<button className="arm-button" onPointerDown={()=>armTimer.current=window.setTimeout(()=>setArmed(true),2000)} onPointerUp={()=>clearTimeout(armTimer.current)} onPointerCancel={()=>clearTimeout(armTimer.current)}>Hold 2 seconds to arm</button>:<button className="start-button" disabled={pending>0} onPointerDown={()=>capture('start')}>{pending>0?'START SAVED':'START RACE'}</button>}<p>{pending>0?'Start saved on this phone. Keep the role reserved and reconnect to the laptop to make it official.':online?'Start role reserved. Recalibrate immediately before leaving; the gun tap will be saved on this phone.':'Start role reserved offline. The gun tap will be saved locally; return to the laptop network afterward to set the official start.'}</p><button style={{background:'#353d49'}} disabled={!online||pending>0} onClick={release}>{pending>0?'Start Queued — Role Reserved':online?'Release Start Role':'Reconnect to Release Start'}</button></section>:
      active==='timer'?<section className="timer-screen" style={{flex:'1 0 auto'}}><div className="sequence">NEXT FINISH #{state?.next_time_place??1}{pending?` + ${pending} queued`:''}</div><button className="finish-button" onPointerDown={e=>{e.preventDefault();capture('time')}}>RECORD<br/>FINISH</button></section>:
      <section className="bib-screen" style={{flexShrink:0,margin:'0 auto'}}><div className="sequence">NEXT BIB POSITION #{state?.next_bib_place??1}</div><input className="bib-display" inputMode="text" autoCapitalize="characters" value={bib} onChange={e=>setBib(e.target.value.toUpperCase())} placeholder="BIB" onKeyDown={e=>{if(e.key==='Enter')submitBib()}}/>
        <div className="keypad">{['1','2','3','4','5','6','7','8','9','ABC','0','⌫'].map(k=><button key={k} onClick={()=>k==='⌫'?setBib(v=>v.slice(0,-1)):k==='ABC'?document.querySelector<HTMLInputElement>('.bib-display')?.focus():setBib(v=>v+k)}>{k}</button>)}</div>
        <div className="bib-actions"><button onClick={()=>submitBib()} disabled={!bib}>Submit Bib</button><button className="placeholder" onClick={()=>capture('bib','?')}>No Bib / Numbered Stick</button><button style={{background:'#596273',gridColumn:'1 / -1'}} onClick={()=>capture('bib','__GENERIC__')}>Extra Finish / Exclude from Results</button></div>
      </section>}
      {visibleAck&&<div className="last-ack" style={{width:'100%',flexShrink:0}}><strong>#{visibleAck.place} {visibleAckValue}</strong><span>{visibleAck.participant_name} {visibleAck.event_name}</span><button onClick={undo}>Undo last</button></div>}
    </main>
    <footer style={{flexShrink:0,paddingBottom:'max(16px, env(safe-area-inset-bottom))'}}><div className={`companion-message ${visibleAck?.warning?'warning':''}`}>{message||'READY'}</div>{pending+orphaned>0&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:8,padding:'8px 10px',border:'1px solid #a66030',borderRadius:8,color:'#ffad42'}}><span>{pending} current · {orphaned} older queued</span><button style={{background:'#526173',padding:'8px 12px'}} onClick={()=>setQueueOpen(true)}>Review</button></div>}<button className="release" disabled={!heldRole||pending>0||active==='start'} onClick={release}>Release role</button></footer>
  </div>;
}
