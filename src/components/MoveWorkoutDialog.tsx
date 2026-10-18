import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { useActiveWorkouts, useStore, type MoveMode } from "../store/useStore";
import { hasProgress, isEmptyWorkout, matchExisting } from "../lib/workoutPlan";
import { dateKey, parseKey } from "../lib/dates";
import { MonthGrid } from "./MultiDatePicker";

const dayLabel = (key: string) => format(parseKey(key), "EEE d MMM");

const MODES: { mode: MoveMode; label: string }[] = [
  { mode: "swap", label: "Swap days" },
  { mode: "append", label: "Add to it" },
];

/** Reschedule `date`'s workout: pick a day on a calendar, then move it there. */
export default function MoveWorkoutDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const workouts = useActiveWorkouts();
  const moveWorkout = useStore((s) => s.moveWorkout);
  const [target, setTarget] = useState<string | null>(null);
  const [mode, setMode] = useState<MoveMode>("swap");

  const filled = useMemo(() => workouts.filter((w) => !isEmptyWorkout(w)), [workouts]);
  const filledDates = useMemo(() => new Set(filled.map((w) => w.date)), [filled]);
  const current = filled.find((w) => w.date === date);
  const there = target ? filled.find((w) => w.date === target) : undefined;

  const quick = [
    { label: "Tomorrow", key: dateKey(addDays(parseKey(date), 1)) },
    { label: "Day after", key: dateKey(addDays(parseKey(date), 2)) },
    { label: `Next ${format(parseKey(date), "EEE")}`, key: dateKey(addDays(parseKey(date), 7)) },
  ];

  // "Add to it" skips exercises the day already has (unless this one has marks or numbers).
  const skipped =
    there && current
      ? [...matchExisting(there.exercises, current.exercises).keys()]
          .map((i) => current.exercises[i])
          .filter((e) => !hasProgress(e))
          .map((e) => e.name)
      : [];

  const action = !target
    ? "Pick a day"
    : !there
      ? `Move to ${dayLabel(target)}`
      : mode === "swap"
        ? `Swap with ${dayLabel(target)}`
        : `Add to ${dayLabel(target)}`;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-label="Move workout"
        className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] dark:bg-slate-900 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Move workout</h2>
            <p className="truncate text-xs text-slate-500">
              {current?.name ?? "Workout"} · {dayLabel(date)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-slate-400">
            Close
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setTarget(q.key)}
              aria-pressed={target === q.key}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                target === q.key
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Keyed so a quick pick in another month turns the calendar to it. */}
        <MonthGrid
          key={target ? target.slice(0, 7) : date.slice(0, 7)}
          initialDate={target ?? date}
          isSelected={(k) => k === target}
          onTap={setTarget}
          isDisabled={(k) => k === date}
          markedDates={filledDates}
        />

        {there && target && (
          <div className="rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800">
            <p className="mb-1.5">
              {dayLabel(target)} already has {there.name ? <b>{there.name}</b> : "a workout"}:
            </p>
            <div className="flex gap-2" role="radiogroup" aria-label="Day already has a workout">
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.mode}
                  onClick={() => setMode(m.mode)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium ${
                    mode === m.mode
                      ? "bg-sky-600 text-white"
                      : "bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {mode === "swap"
                ? `${there.name ?? "That workout"} moves to ${dayLabel(date)}.`
                : `Both workouts on ${dayLabel(target)}.` +
                  (skipped.length ? ` Already there, so not added twice: ${skipped.join(", ")}.` : "")}
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={!target}
          onClick={() => {
            if (!target) return;
            moveWorkout(date, target, mode);
            onClose();
          }}
          className="w-full rounded-xl bg-sky-600 px-4 py-2.5 font-medium text-white disabled:opacity-40"
        >
          {action}
        </button>
        <p className="text-center text-[11px] text-slate-400">
          Checkmarks and logged numbers move with it. Check-ins stay on their day.
        </p>
      </div>
    </div>
  );
}
