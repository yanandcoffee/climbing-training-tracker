import type {
  ExerciseStatus,
  MeasureType,
  Metrics,
  Prescription,
  SetResult,
  WeightUnit,
  Workout,
} from "../types";

export interface HistoryPoint {
  date: string; // 'YYYY-MM-DD'
  status: ExerciseStatus;
  measureType: MeasureType;
  prescription?: Prescription;
  metrics: Metrics; // as logged
  /** Logged per-set results (blank rows removed). */
  sets: SetResult[];
  /** Logged metrics, filled in from the prescription when completed as prescribed. */
  effective: Metrics;
}

const isFilled = (s: SetResult) => s.reps != null || s.weight != null || s.durationSec != null;

/** Logged per-set results; an older single result counts as one set. Blank rows are dropped. */
export function loggedSets(m: Metrics | undefined): SetResult[] {
  if (!m) return [];
  const sets = m.sets?.length ? m.sets : [{ reps: m.reps, weight: m.weight, durationSec: m.durationSec }];
  return sets.filter(isFilled);
}

export function hasLogged(m: Metrics | undefined): boolean {
  return !!m && (loggedSets(m).length > 0 || m.rpe != null);
}

/** One line per set, e.g. "10 reps @ 11.25 lb · 8 reps @ 11.25 lb". */
export function setsSummary(sets: SetResult[], unit: WeightUnit = "lb"): string {
  return sets
    .map((s) =>
      [
        s.reps != null && `${s.reps} reps`,
        s.durationSec != null && `${s.durationSec}s`,
        s.weight != null && `${s.weight} ${unit}`,
      ]
        .filter(Boolean)
        .join(" @ "),
    )
    .join(" · ");
}

/**
 * Collapse per-set results to one value each for charting: the best set
 * (highest reps / weight / seconds). Volume is summed over the sets instead.
 */
export function flattenMetrics(m: Metrics): Metrics {
  const sets = loggedSets(m);
  if (!sets.length) return { ...m };
  const best = (k: keyof SetResult) => {
    const v = sets.map((s) => s[k]).filter((n): n is number => n != null);
    return v.length ? Math.max(...v) : undefined;
  };
  return {
    rpe: m.rpe,
    sets,
    reps: best("reps"),
    weight: best("weight"),
    durationSec: best("durationSec"),
  };
}

/**
 * What was actually done. Logged numbers win; for an item marked complete
 * without logging, the prescription is taken as done — so progressions show up
 * on the chart without extra typing.
 */
export function effectiveMetrics(
  status: ExerciseStatus,
  measureType: MeasureType,
  p: Prescription | undefined,
  raw: Metrics,
): Metrics {
  const m = flattenMetrics(raw);
  if (status !== "complete" || !p) return m;
  const out: Metrics = { ...m };
  if (out.weight == null && p.weight != null) out.weight = p.weight;
  if (measureType === "reps" && out.reps == null && p.reps != null) out.reps = p.reps;
  if ((measureType === "hold" || measureType === "duration") && out.durationSec == null && p.holdSec != null)
    out.durationSec = p.holdSec;
  return out;
}

/** Assemble a per-exercise time series from all workouts that reference it. */
export function exerciseHistory(workouts: Workout[], exerciseId: string): HistoryPoint[] {
  const points: HistoryPoint[] = [];
  for (const w of workouts) {
    for (const we of w.exercises) {
      if (we.exerciseId !== exerciseId) continue;
      const metrics = we.metrics ?? {};
      points.push({
        date: w.date,
        status: we.status,
        measureType: we.measureType,
        prescription: we.prescription,
        metrics,
        sets: loggedSets(metrics),
        effective: effectiveMetrics(we.status, we.measureType, we.prescription, metrics),
      });
    }
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export interface MetricOption {
  key: string;
  label: string;
  unit?: string;
  value: (m: Metrics) => number | undefined;
}

export function metricOptions(measureType: MeasureType, weightUnit: WeightUnit = "lb"): MetricOption[] {
  const rpe: MetricOption = { key: "rpe", label: "RPE", value: (m) => m.rpe };
  switch (measureType) {
    case "reps":
      return [
        { key: "reps", label: "Reps", value: (m) => m.reps },
        { key: "weight", label: "Weight", unit: weightUnit, value: (m) => m.weight },
        {
          key: "volume",
          label: "Volume",
          unit: `${weightUnit}·reps`,
          value: (m) => {
            const sets = m.sets?.length ? m.sets : [{ reps: m.reps, weight: m.weight }];
            const parts = sets
              .map((s) => (s.reps != null && (s.weight ?? m.weight) != null ? s.reps * (s.weight ?? m.weight)! : undefined))
              .filter((n): n is number => n != null);
            return parts.length ? parts.reduce((a, b) => a + b, 0) : undefined;
          },
        },
        rpe,
      ];
    case "reps_in_time":
      return [{ key: "reps", label: "Reps achieved", value: (m) => m.reps }, rpe];
    case "hold":
    case "duration":
      return [
        { key: "durationSec", label: "Seconds", unit: "s", value: (m) => m.durationSec },
        { key: "weight", label: "Weight", unit: weightUnit, value: (m) => m.weight },
        rpe,
      ];
    case "check":
      return [rpe];
  }
}
