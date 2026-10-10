import type { DayColor } from "../types";

// Readiness point bands per the spec:
//   Green  = +1..+5   (quality 0..1 maps to 1..5)
//   Yellow = 0
//   Orange = 0..-2    (quality 0..1 maps to 0..-2)
//   Red    = -3..-5   (quality 0..1 maps to -3..-5)
//   Black  = -10..-100 (quality 0..1 maps to -10..-100, injury severity)

export interface Band {
  min: number;
  max: number; // max is the "best" end; a larger quality -> closer to `max` magnitude
  // We express each band by its endpoints at quality=0 and quality=1.
  atZero: number;
  atOne: number;
  step: number; // slider granularity
}

export const COLOR_BANDS: Record<DayColor, Band> = {
  // quality 0 -> least points in band, quality 1 -> most
  green: { min: 1, max: 5, atZero: 1, atOne: 5, step: 1 },
  yellow: { min: 0, max: 0, atZero: 0, atOne: 0, step: 1 },
  orange: { min: -2, max: 0, atZero: 0, atOne: -2, step: 1 },
  red: { min: -5, max: -3, atZero: -3, atOne: -5, step: 1 },
  black: { min: -100, max: -10, atZero: -10, atOne: -100, step: 10 },
};

/**
 * Map a per-color quality value (0..1) to resolved readiness points.
 * For green, higher quality = more positive. For orange/red/black, higher
 * quality = more negative (worse), reflecting severity.
 */
export function scoreForCheckIn(color: DayColor, quality: number): number {
  const band = COLOR_BANDS[color];
  const q = Math.min(1, Math.max(0, quality));
  const raw = band.atZero + (band.atOne - band.atZero) * q;
  return Math.round(raw);
}

/** The discrete point values a color offers, ordered mild → severe. */
export function pointOptions(color: DayColor): number[] {
  const b = COLOR_BANDS[color];
  if (b.atZero === b.atOne) return [b.atZero];
  const count = Math.round(Math.abs(b.atOne - b.atZero) / b.step) + 1;
  const dir = b.atOne > b.atZero ? 1 : -1;
  return Array.from({ length: count }, (_, i) => b.atZero + dir * b.step * i);
}

/** Inverse of scoreForCheckIn: the 0..1 quality that yields `points`. */
export function qualityForPoints(color: DayColor, points: number): number {
  const b = COLOR_BANDS[color];
  if (b.atZero === b.atOne) return 0;
  return (points - b.atZero) / (b.atOne - b.atZero);
}

/** Snap an arbitrary stored points value to the nearest available slot. */
export function nearestPointOption(color: DayColor, points: number): number {
  return pointOptions(color).reduce((best, p) =>
    Math.abs(p - points) < Math.abs(best - points) ? p : best,
  );
}

export const COLOR_HEX: Record<DayColor, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
  black: "#111827",
};

/** Human-readable description of the band for slider labelling. */
export function bandRangeLabel(color: DayColor): string {
  const b = COLOR_BANDS[color];
  if (b.atZero === b.atOne) return `${b.atZero >= 0 ? "+" : ""}${b.atZero}`;
  const lo = scoreForCheckIn(color, 0);
  const hi = scoreForCheckIn(color, 1);
  const fmt = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  return `${fmt(lo)} … ${fmt(hi)}`;
}
