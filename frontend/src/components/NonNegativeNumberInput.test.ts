import { describe, expect, it } from 'vitest';
import { isNonNegativeNumberDraft } from './NonNegativeNumberInput';

describe('isNonNegativeNumberDraft', () => {
  it('allows blank and whole-number drafts', () => {
    expect(isNonNegativeNumberDraft('')).toBe(true);
    expect(isNonNegativeNumberDraft('0')).toBe(true);
    expect(isNonNegativeNumberDraft('123')).toBe(true);
  });

  it('rejects signs, exponents, and decimals for integer fields', () => {
    expect(isNonNegativeNumberDraft('-1')).toBe(false);
    expect(isNonNegativeNumberDraft('+1')).toBe(false);
    expect(isNonNegativeNumberDraft('1e3')).toBe(false);
    expect(isNonNegativeNumberDraft('1.5')).toBe(false);
  });

  it('allows one decimal point only for decimal fields', () => {
    expect(isNonNegativeNumberDraft('', true)).toBe(true);
    expect(isNonNegativeNumberDraft('.5', true)).toBe(true);
    expect(isNonNegativeNumberDraft('12.50', true)).toBe(true);
    expect(isNonNegativeNumberDraft('1.2.3', true)).toBe(false);
    expect(isNonNegativeNumberDraft('-0.5', true)).toBe(false);
  });
});
