import type { ExerciseStatus, MeasureType, Metrics, Workout } from "../types";

export interface HistoryPoint {
  date: string; // 'YYYY-MM-DD'
  status: ExerciseStatus;
  metrics: Metrics;
}

/** Assemble a per-exercise time series from all workouts that reference it. */
export function exerciseHistory(
  workouts: Workout[],
  exerciseId: string,
): HistoryPoint[] {
  const points: HistoryPoint[] = [];
  for (const w of workouts) {
    for (const we of w.exercises) {
      if (we.exerciseId === exerciseId) {
        points.push({ date: w.date, status: we.status, metrics: we.metrics ?? {} });
      }
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

export function metricOptions(measureType: MeasureType): MetricOption[] {
  switch (measureType) {
    case "reps":
      return [
        { key: "reps", label: "Reps", value: (m) => m.reps },
        { key: "weight", label: "Weight", unit: "kg", value: (m) => m.weight },
        {
          key: "volume",
          label: "Volume",
          unit: "kg·reps",
          value: (m) =>
            m.reps != null && m.weight != null ? m.reps * m.weight : undefined,
        },
        { key: "rpe", label: "RPE", value: (m) => m.rpe },
      ];
    case "reps_in_time":
      return [
        { key: "reps", label: "Reps achieved", value: (m) => m.reps },
        { key: "rpe", label: "RPE", value: (m) => m.rpe },
      ];
    case "hold":
    case "duration":
      return [
        {
          key: "durationSec",
          label: "Seconds",
          unit: "s",
          value: (m) => m.durationSec,
        },
        { key: "rpe", label: "RPE", value: (m) => m.rpe },
      ];
  }
}
