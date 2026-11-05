/** Round a positive maximum up to a readable 1, 2, 5, or 10 scale. */
export function chartUpperBound(maximum: number): number {
  if (!Number.isFinite(maximum) || maximum <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const normalized = maximum / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return Number((step * magnitude).toPrecision(12));
}
