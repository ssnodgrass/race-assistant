export function checkInPairingURL(url: string): string {
  return url.replace('/companion/', '/checkin/');
}
