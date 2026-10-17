import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { activeExercises, useActiveWorkouts, useStore } from "../store/useStore";
import { CATEGORY_LABELS, MEASURE_LABELS } from "../types";
import { exerciseHistory, metricOptions, setsSummary } from "../lib/history";
import { prescriptionSummary } from "../lib/workoutPlan";
import { shortDate } from "../lib/dates";
import { ExerciseMediaView } from "../components/ExerciseMedia";
import TrendChart from "../components/TrendChart";
import { UndoInlineButton } from "../components/UndoButton";

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  complete: { label: "✓ Done", cls: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  partial: { label: "◐ Partial", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  skipped: { label: "✗ Skipped", cls: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  none: { label: "Planned", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

export default function ExerciseDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const ex = useStore((s) => activeExercises(s).find((e) => e.id === id));
  const workouts = useActiveWorkouts();
  const retype = useStore((s) => s.retypeExerciseEntries);

  const history = useMemo(
    () => (id ? exerciseHistory(workouts, id) : []),
    [workouts, id],
  );
  // Chart in the units of the most recent use (an exercise can be re-typed over time).
  const latest = history[history.length - 1];
  const chartMeasure = latest?.measureType ?? ex?.measureType ?? "reps";
  const options = metricOptions(chartMeasure, latest?.prescription?.weightUnit ?? "lb");
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

  // Entries logged under another type (e.g. before the exercise was re-typed in the library).
  const mismatched = history.filter((p) => p.measureType !== ex.measureType);
  const otherTypes = [...new Set(mismatched.map((p) => MEASURE_LABELS[p.measureType]))];

  const option = options.find((o) => o.key === metricKey) ?? options[0];
  // "Done" without logged numbers counts as the target (see effectiveMetrics).
  const chartData = history
    .filter((p) => p.measureType === chartMeasure)
    .map((p) => ({ date: shortDate(p.date), value: option?.value(p.effective) }))
    .filter((d) => d.value != null) as { date: string; value: number }[];

  return (
    <div className="space-y-4 py-4">
      <header>
        <div className="flex items-center justify-between">
          <Link to="/exercises" className="text-sm text-sky-600 dark:text-sky-400">
            ← Exercises
          </Link>
          <UndoInlineButton className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" />
        </div>
        <h1 className="text-xl font-bold">{ex.name}</h1>
        <p className="text-sm text-slate-500">
          {CATEGORY_LABELS[ex.category]} · {MEASURE_LABELS[ex.measureType]}
        </p>
      </header>

      {mismatched.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <p>
            {mismatched.length === 1 ? "1 day has" : `${mismatched.length} days have`} it as{" "}
            <span className="font-medium">{otherTypes.join(" / ")}</span>, not{" "}
            <span className="font-medium">{MEASURE_LABELS[ex.measureType]}</span>.
          </p>
          <button
            type="button"
            onClick={() => retype(ex.id, ex.measureType)}
            className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            Change {mismatched.length === 1 ? "it" : `all ${mismatched.length}`} to {MEASURE_LABELS[ex.measureType]}
          </button>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Targets and logged numbers stay as they are, so you can undo or switch back.
          </p>
        </section>
      )}

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
            format={option?.format}
          />
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">
            No data yet. Mark it Done in a workout (or log numbers) to see its trend.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-base font-semibold">History</h2>
        {history.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...history].reverse().map((p, i) => {
              const chip = STATUS_CHIP[p.status] ?? STATUS_CHIP.none;
              const logged = [
                p.sets.length > 0 && setsSummary(p.sets, p.prescription?.weightUnit ?? "lb"),
                p.metrics.rpe != null && `RPE ${p.metrics.rpe}`,
              ].filter(Boolean);
              return (
                <li key={i}>
                  <Link to={`/day/${p.date}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="w-14 shrink-0 text-xs text-slate-500">{shortDate(p.date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {prescriptionSummary(p.measureType, p.prescription) || "No target"}
                      </span>
                      {logged.length > 0 && (
                        <span className="block text-xs text-slate-500">Logged: {logged.join(" · ")}</span>
                      )}
                    </span>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${chip.cls}`}>
                      {chip.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">Not in any workout yet.</p>
        )}
      </section>
    </div>
  );
}
