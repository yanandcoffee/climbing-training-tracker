import type { Workout, WorkoutExercise } from "../types";
import { shortDate } from "../lib/dates";
import { hasProgress, matchExisting, type MergeMode } from "../lib/workoutPlan";

const LABEL: Record<MergeMode, string> = { append: "Add to it", replace: "Replace it" };

/**
 * Replace / Add to it, for days that already have a workout. Shows what
 * replacing would erase, and which exercises adding would skip as already there.
 */
export default function ExistingWorkoutChoice({
  existing,
  incoming,
  mode,
  onMode,
}: {
  existing: Workout[];
  incoming: Pick<WorkoutExercise, "exerciseId" | "name">[];
  mode: MergeMode;
  onMode: (m: MergeMode) => void;
}) {
  if (!existing.length) return null;
  const withProgress = existing
    .map((w) => ({ date: w.date, n: w.exercises.filter(hasProgress).length }))
    .filter((d) => d.n > 0);
  const skipped = existing
    .map((w) => ({
      date: w.date,
      names: [...matchExisting(w.exercises, incoming).keys()].map((i) => incoming[i].name),
    }))
    .filter((d) => d.names.length);

  return (
    <div className="rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800">
      <p className="mb-1.5">
        {existing.map((w) => shortDate(w.date)).join(", ")} {existing.length === 1 ? "already has" : "already have"} a
        workout:
      </p>
      <div className="flex gap-2" role="radiogroup" aria-label="Existing workout">
        {(["append", "replace"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => onMode(m)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium ${
              mode === m ? "bg-sky-600 text-white" : "bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200"
            }`}
          >
            {LABEL[m]}
          </button>
        ))}
      </div>
      {mode === "replace" && withProgress.length > 0 && (
        <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
          Replacing erases what you've done on{" "}
          {withProgress
            .map((d) => `${shortDate(d.date)} (${d.n} exercise${d.n === 1 ? "" : "s"} marked or logged)`)
            .join(", ")}
          .
        </p>
      )}
      {mode === "append" && skipped.length > 0 && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Already there, so not added twice:{" "}
          {skipped.map((d) => (existing.length > 1 ? `${shortDate(d.date)}: ` : "") + d.names.join(", ")).join("; ")}.
        </p>
      )}
    </div>
  );
}
