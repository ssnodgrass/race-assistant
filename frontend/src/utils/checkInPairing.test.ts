import { describe, expect, it } from 'vitest';
import { checkInPairingURL } from './checkInPairing';

describe('checkInPairingURL', () => {
  it('keeps the origin and credential while changing the app route', () => {
    expect(checkInPairingURL('https://race-assistant.local:8443/companion/#pair=secret'))
      .toBe('https://race-assistant.local:8443/checkin/#pair=secret');
  });
});
