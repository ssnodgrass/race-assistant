export function pairingCredentialFrom(value: string, expectedOrigin = location.origin, expectedPath = '/companion/'): string {
  const trimmed = value.trim();
  if (/^\d{6,8}$/.test(trimmed)) return trimmed;
  if (/^[a-f0-9]{64}$/i.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('That QR code is not a Race Assistant pairing code.');
  }
  if (url.origin !== expectedOrigin || url.pathname !== expectedPath) {
    throw new Error('That QR code is for a different Race Assistant address.');
  }
  const token = new URLSearchParams(url.hash.slice(1)).get('pair') || '';
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    throw new Error('That QR code is not a current pairing QR.');
  }
  return token;
}
