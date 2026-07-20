import { describe, expect, it } from 'vitest';
import { pairingCredentialFrom } from './companionPairing';

const origin = 'https://192.168.50.2:8443';
const token = 'a'.repeat(64);

describe('companion pairing credentials', () => {
  it('accepts six- to eight-digit codes without losing leading zeroes', () => {
    expect(pairingCredentialFrom(' 01234567 ', origin)).toBe('01234567');
    expect(pairingCredentialFrom('123456', origin)).toBe('123456');
  });

  it('extracts a QR token only from this companion origin and path', () => {
    expect(pairingCredentialFrom(`${origin}/companion/#pair=${token}`, origin)).toBe(token);
    expect(() => pairingCredentialFrom(`https://other.local:8443/companion/#pair=${token}`, origin)).toThrow(/different Race Assistant address/);
    expect(() => pairingCredentialFrom(`${origin}/companion-setup#pair=${token}`, origin)).toThrow(/different Race Assistant address/);
  });

  it('rejects malformed codes and unrelated QR values', () => {
    expect(() => pairingCredentialFrom('12345', origin)).toThrow(/not a Race Assistant pairing code/);
    expect(() => pairingCredentialFrom(`${origin}/companion/#pair=short`, origin)).toThrow(/not a current pairing QR/);
  });
});
