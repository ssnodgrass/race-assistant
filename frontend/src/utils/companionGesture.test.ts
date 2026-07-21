import { describe, expect, it } from 'vitest';
import { isIntentionalTap } from './companionGesture';

describe('companion finish gesture', () => {
  it('accepts a stationary press and release', () => {
    expect(isIntentionalTap({ x: 100, y: 100 }, { x: 104, y: 105 })).toBe(true);
  });

  it('rejects a scroll or drag across the finish button', () => {
    expect(isIntentionalTap({ x: 100, y: 100 }, { x: 100, y: 130 })).toBe(false);
  });
});
