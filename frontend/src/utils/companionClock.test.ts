import { describe, expect, it } from 'vitest';
import { correctCapture, formatElapsedHundredths, selectCalibration } from './companionClock';

describe('companion clock',()=>{
  it('uses the median offset from the three lowest latency samples',()=>{
    const result=selectCalibration([{offset:50,rtt:100},{offset:11,rtt:8},{offset:10,rtt:6},{offset:12,rtt:7},{offset:-40,rtt:90}],123);
    expect(result).toEqual({offset:11,uncertainty:4,at:123});
  });
  it('linearly corrects a capture between pre and post calibrations',()=>{
    const result=correctCapture({captured_at_unix_ms:1510,client_captured_at_unix_ms:1500,calibration_at_unix_ms:1000,calibration_offset_ms:10,uncertainty_ms:3},{at:2000,offset:20,uncertainty:4});
    expect(result.captured_at_unix_ms).toBe(1515);
    expect(result.uncertainty_ms).toBe(4);
  });
  it('formats hundredths without losing the canonical milliseconds',()=>{
    expect(formatElapsedHundredths(3_723_129)).toBe('01:02:03.12');
  });
});
