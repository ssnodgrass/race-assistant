export interface PointerPosition {
  x: number;
  y: number;
}

export function pointerTravel(start: PointerPosition, end: PointerPosition): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function isIntentionalTap(start: PointerPosition, end: PointerPosition, tolerance = 14): boolean {
  return pointerTravel(start, end) <= tolerance;
}
