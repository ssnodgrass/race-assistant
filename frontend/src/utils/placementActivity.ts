export interface PlacementActivity {
  place: number;
  bib_number: string;
  entered_at_unix_ms?: number;
}

export function latestChangedPlacement<T extends PlacementActivity>(
  previous: PlacementActivity[],
  current: T[],
): T | null {
  const previousByPlace = new Map(previous.map(placement => [placement.place, placement.bib_number]));
  const changed = current.filter(
    placement => previousByPlace.get(placement.place) !== placement.bib_number,
  );

  if (changed.length === 0) return null;
  return changed.reduce((latest, placement) => {
    const latestEnteredAt = latest.entered_at_unix_ms || 0;
    const placementEnteredAt = placement.entered_at_unix_ms || 0;
    if (placementEnteredAt !== latestEnteredAt) {
      return placementEnteredAt > latestEnteredAt ? placement : latest;
    }
    return placement.place > latest.place ? placement : latest;
  });
}
