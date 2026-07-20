export interface ClockSample { offset: number; rtt: number }
export interface Calibration { offset: number; uncertainty: number; at: number }
export interface CapturedClockEvidence {
  captured_at_unix_ms: number;
  client_captured_at_unix_ms: number;
  calibration_at_unix_ms: number;
  calibration_offset_ms: number;
  uncertainty_ms: number;
}

export function selectCalibration(samples: ClockSample[], at = Date.now()): Calibration {
  if (samples.length < 3) throw new Error('at least three clock samples are required');
  const best = [...samples].sort((a,b)=>a.rtt-b.rtt).slice(0,3).sort((a,b)=>a.offset-b.offset);
  return { offset: best[1].offset, uncertainty: Math.max(1,best[1].rtt/2), at };
}

export function correctCapture<T extends CapturedClockEvidence>(entry:T, post:Calibration):T {
  if (!entry.client_captured_at_unix_ms || post.at <= entry.calibration_at_unix_ms) return entry;
  const span = post.at-entry.calibration_at_unix_ms;
  const ratio = Math.max(0,Math.min(1,(entry.client_captured_at_unix_ms-entry.calibration_at_unix_ms)/span));
  const correctedOffset = entry.calibration_offset_ms+(post.offset-entry.calibration_offset_ms)*ratio;
  return {...entry,captured_at_unix_ms:Math.round(entry.client_captured_at_unix_ms+correctedOffset),uncertainty_ms:Math.max(entry.uncertainty_ms,post.uncertainty)};
}

export function formatElapsedHundredths(ms:number):string {
  ms=Math.max(0,ms);const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000),cs=Math.floor(ms%1000/10);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}
