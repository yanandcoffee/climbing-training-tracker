import { useMemo, useState } from "react";
import type { Workout } from "../types";
import { useActiveWorkouts, useStore } from "../store/useStore";
import { defaultMergeMode, isEmptyWorkout, type MergeMode, type WorkoutBody } from "../lib/workoutPlan";
import { prettyDate, shortDate } from "../lib/dates";
import MultiDatePicker from "./MultiDatePicker";
import ExistingWorkoutChoice from "./ExistingWorkoutChoice";

const bodyOf = (w: Workout): WorkoutBody => ({
  name: w.name,
  sections: w.sections ?? [],
  exercises: w.exercises,
});

/**
 * "from": pick an earlier workout to copy onto `date`.
 * "to":   copy `date`'s workout onto other days.
 * Copies keep the prescriptions; progress (checkmarks, logged numbers) starts fresh.
 */
export default function CopyWorkoutDialog({
  date,
  direction,
  onClose,
}: {
  date: string;
  direction: "from" | "to";
  onClose: () => void;
}) {
  const workouts = useActiveWorkouts();
  const applyWorkoutToDates = useStore((s) => s.applyWorkoutToDates);

  const filled = useMemo(
    () =>
      workouts
        .filter((w) => !isEmptyWorkout(w))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [workouts],
  );
  const filledDates = useMemo(() => new Set(filled.map((w) => w.date)), [filled]);
  const current = filled.find((w) => w.date === date);

  const [targets, setTargets] = useState<string[]>([]);
  const [picked, setPicked] = useState<MergeMode | null>(null);

  const conflicts =
    direction === "from"
      ? current
        ? [date]
        : []
      : targets.filter((d) => filledDates.has(d) && d !== date);

  const sources = filled.filter((w) => w.date !== date);
  const mode = picked ?? defaultMergeMode(filled.filter((w) => conflicts.includes(w.date)));

  const modePicker = (
    <ExistingWorkoutChoice
      existing={filled.filter((w) => conflicts.includes(w.date))}
      incoming={direction === "to" && current ? current.exercises : []}
      mode={mode}
      onMode={setPicked}
    />
  );

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-t-2xl bg-white p-4 dark:bg-slate-900 sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {direction === "from" ? `Copy a workout to ${shortDate(date)}` : "Copy to other days"}
          </h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-400">
            Close
          </button>
        </div>

        {direction === "from" ? (
          <>
            {modePicker}
            {sources.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No other workouts yet.</p>
            ) : (
              <ul className="space-y-2">
                {sources.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => {
                        applyWorkoutToDates(bodyOf(w), [date], mode);
                        onClose();
                      }}
                      className="w-full rounded-xl border border-slate-200 p-3 text-left dark:border-slate-700"
                    >
                      <p className="text-xs text-slate-500">{prettyDate(w.date)}</p>
                      <p className="font-medium">{w.name ?? "Workout"}</p>
                      <p className="text-xs text-slate-500">
                        {w.exercises.length} exercise{w.exercises.length === 1 ? "" : "s"}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <MultiDatePicker selected={targets} onChange={setTargets} markedDates={filledDates} />
            {modePicker}
            <button
              type="button"
              disabled={!targets.length || !current}
              onClick={() => {
                if (!current) return;
                applyWorkoutToDates(
                  bodyOf(current),
                  targets.filter((d) => d !== date),
                  mode,
                );
                onClose();
              }}
              className="w-full rounded-xl bg-sky-600 px-4 py-2.5 font-medium text-white disabled:opacity-40"
            >
              {targets.length <= 1 ? "Copy" : `Copy to ${targets.length} days`}
            </button>
          </>
        )}
        <p className="text-center text-[11px] text-slate-400">
          Sets and reps are copied; checkmarks and logged numbers start fresh.
        </p>
      </div>
    </div>
  );
}
