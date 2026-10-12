import type {
  ExerciseStatus,
  MeasureType,
  Metrics,
  Prescription,
  WeightUnit,
  Workout,
} from "../types";

export interface HistoryPoint {
  date: string; // 'YYYY-MM-DD'
  status: ExerciseStatus;
  measureType: MeasureType;
  prescription?: Prescription;
  metrics: Metrics; // as logged
  /** Logged metrics, filled in from the prescription when completed as prescribed. */
  effective: Metrics;
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
  m: Metrics,
): Metrics {
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
          value: (m) => (m.reps != null && m.weight != null ? m.reps * m.weight : undefined),
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
