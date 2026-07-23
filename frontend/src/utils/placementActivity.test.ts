import { describe, expect, it } from 'vitest';
import { latestChangedPlacement, PlacementActivity } from './placementActivity';

const placement = (place: number, bib_number: string): PlacementActivity => ({ place, bib_number });

describe('placement activity', () => {
  it('returns a newly appended companion placement as the latest activity', () => {
    expect(latestChangedPlacement(
      [placement(1, '101')],
      [placement(1, '101'), placement(2, '202')],
    )).toEqual(placement(2, '202'));
  });

  it('returns a manually changed placement', () => {
    expect(latestChangedPlacement(
      [placement(1, '101'), placement(2, '202')],
      [placement(1, '303'), placement(2, '202')],
    )).toEqual(placement(1, '303'));
  });

  it('does not change the active placement during an unchanged poll', () => {
    const placements = [placement(1, '101'), placement(2, '202')];
    expect(latestChangedPlacement(placements, placements)).toBeNull();
  });

  it('uses the newest chute place if several queued entries arrive together', () => {
    expect(latestChangedPlacement(
      [placement(1, '101')],
      [placement(1, '101'), placement(2, '202'), placement(3, '303')],
    )).toEqual(placement(3, '303'));
  });

  it('uses entry time when a newer edit targets a lower chute place', () => {
    expect(latestChangedPlacement(
      [],
      [
        { ...placement(3, '303'), entered_at_unix_ms: 1000 },
        { ...placement(1, '101'), entered_at_unix_ms: 2000 },
      ],
    )).toEqual({ ...placement(1, '101'), entered_at_unix_ms: 2000 });
  });
});
