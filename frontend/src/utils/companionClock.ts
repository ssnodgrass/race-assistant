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
  const hundredths=Math.round(Math.max(0,ms)/10),h=Math.floor(hundredths/360000),m=Math.floor(hundredths%360000/6000),s=Math.floor(hundredths%6000/100),cs=hundredths%100;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

export function formatStoredElapsedHundredths(value:string):string {
  const match=value.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if(!match)return value;
  const milliseconds=Number(match[1])*3600000+Number(match[2])*60000+Number(match[3])*1000+Number((match[4]||'').padEnd(3,'0'));
  return formatElapsedHundredths(milliseconds);
}
