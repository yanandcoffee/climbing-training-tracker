import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { activeExercises, useActiveWorkouts, useStore } from "../store/useStore";
import { CATEGORY_LABELS, MEASURE_LABELS } from "../types";
import { exerciseHistory, metricOptions } from "../lib/history";
import { shortDate } from "../lib/dates";
import { ExerciseMediaView } from "../components/ExerciseMedia";
import TrendChart from "../components/TrendChart";

const STATUS_COLOR: Record<string, string> = {
  complete: "#22c55e",
  partial: "#f59e0b",
  skipped: "#64748b",
  none: "#cbd5e1",
};

export default function ExerciseDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const ex = useStore((s) => activeExercises(s).find((e) => e.id === id));
  const workouts = useActiveWorkouts();

  const history = useMemo(
    () => (id ? exerciseHistory(workouts, id) : []),
    [workouts, id],
  );
  const options = ex ? metricOptions(ex.measureType) : [];
  const [metricKey, setMetricKey] = useState(options[0]?.key ?? "reps");

  if (!ex) {
    return (
      <div className="py-10 text-center text-slate-400">
        Exercise not found.{" "}
        <Link to="/exercises" className="text-sky-600">
          Back to library
        </Link>
      </div>
    );
  }

  const option = options.find((o) => o.key === metricKey) ?? options[0];
  const chartData = history
    .map((p) => ({ date: shortDate(p.date), value: option?.value(p.metrics) }))
    .filter((d) => d.value != null) as { date: string; value: number }[];

  return (
    <div className="space-y-4 py-4">
      <header>
        <Link to="/exercises" className="text-sm text-sky-600 dark:text-sky-400">
          ← Exercises
        </Link>
        <h1 className="text-xl font-bold">{ex.name}</h1>
        <p className="text-sm text-slate-500">
          {CATEGORY_LABELS[ex.category]} · {MEASURE_LABELS[ex.measureType]}
        </p>
      </header>

      {ex.mediaUrl && <ExerciseMediaView ex={ex} />}
      {ex.description && (
        <p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
          {ex.description}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Trend</h2>
          <div className="flex flex-wrap gap-1.5">
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setMetricKey(o.key)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  o.key === metricKey
                    ? "bg-sky-600 text-white"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {chartData.length >= 1 ? (
          <TrendChart
            data={chartData}
            unit={option?.unit}
            label={option?.label ?? ""}
          />
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">
            No logged data yet. Log this exercise in a workout to see its trend.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-base font-semibold">Completion history</h2>
        {history.length ? (
          <div className="flex flex-wrap gap-1.5">
            {history.map((p, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-1"
                title={`${p.date}: ${p.status}`}
              >
                <span
                  className="h-6 w-6 rounded"
                  style={{ backgroundColor: STATUS_COLOR[p.status] }}
                />
                <span className="text-[9px] text-slate-400">
                  {shortDate(p.date)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No sessions logged yet.</p>
        )}
      </section>
    </div>
  );
}
