import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  Exercise,
  ExerciseStatus,
  Metrics,
  WorkoutExercise,
} from "../types";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../types";
import { activeWorkouts, useActiveExercises, useStore } from "../store/useStore";
import { uid } from "../lib/id";
import { ExerciseMediaThumb } from "./ExerciseMedia";
import AddExercisePanel from "./AddExercisePanel";

export default function WorkoutDayView({ date }: { date: string }) {
  const getOrCreate = useStore((s) => s.getOrCreateWorkoutForDate);
  const workout = useStore((s) =>
    activeWorkouts(s).find((w) => w.date === date),
  );
  const exercises = useActiveExercises();
  const saveWorkout = useStore((s) => s.saveWorkout);
  const [adding, setAdding] = useState(false);

  // Lazily materialize the day's workout (from schedule or empty) when opened.
  useEffect(() => {
    getOrCreate(date);
  }, [date, getOrCreate]);

  if (!workout) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-400">Preparing workout…</p>
      </section>
    );
  }

  const exById = new Map(exercises.map((e) => [e.id, e]));
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: workout.exercises.filter((e) => e.category === cat),
  })).filter((g) => g.items.length > 0);

  const addExercise = (we: WorkoutExercise) =>
    saveWorkout({ ...workout, exercises: [...workout.exercises, we] });
  const updateExercise = (id: string, patch: Partial<WorkoutExercise>) =>
    saveWorkout({
      ...workout,
      exercises: workout.exercises.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    });
  const removeExercise = (id: string) =>
    saveWorkout({
      ...workout,
      exercises: workout.exercises.filter((e) => e.id !== id),
    });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">
          {workout.name ?? "Workout"}
        </h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          {adding ? "Close" : "+ Add"}
        </button>
      </div>

      {adding && (
        <AddExercisePanel
          library={exercises}
          onAdd={(we) => {
            addExercise(we);
          }}
          onClose={() => setAdding(false)}
        />
      )}

      {grouped.length === 0 && !adding && (
        <p className="py-6 text-center text-sm text-slate-400">
          No exercises yet. Tap <span className="font-semibold">+ Add</span> to
          build today's session, or schedule a template.
        </p>
      )}

      <div className="space-y-5">
        {grouped.map(({ cat, items }) => (
          <div key={cat}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {CATEGORY_LABELS[cat]}
            </h3>
            <ul className="space-y-2">
              {items.map((we) => (
                <ExerciseRow
                  key={we.id}
                  we={we}
                  lib={we.exerciseId ? exById.get(we.exerciseId) : undefined}
                  onStatus={(status) => updateExercise(we.id, { status })}
                  onMetrics={(metrics) =>
                    updateExercise(we.id, {
                      metrics: { ...we.metrics, ...metrics },
                    })
                  }
                  onRemove={() => removeExercise(we.id)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function prescriptionSummary(we: WorkoutExercise): string {
  const p = we.prescription ?? {};
  const sets = p.sets ?? 1;
  switch (we.measureType) {
    case "reps": {
      const base = p.reps ? `${sets} × ${p.reps}` : `${sets} set${sets > 1 ? "s" : ""}`;
      return p.weight ? `${base} @ ${p.weight}kg` : base;
    }
    case "reps_in_time":
      return `${sets} × max reps / ${p.windowSec ?? 10}s`;
    case "hold":
      return `${sets} × ${p.holdSec ?? 0}s hold`;
    case "duration":
      return p.holdSec ? `${Math.round(p.holdSec / 60)} min` : "timed";
  }
}

const STATUS_META: Record<
  Exclude<ExerciseStatus, "none">,
  { icon: string; label: string; cls: string }
> = {
  complete: { icon: "✓", label: "Done", cls: "bg-green-600 text-white" },
  partial: { icon: "◐", label: "Partial", cls: "bg-amber-500 text-white" },
  skipped: { icon: "✗", label: "Skip", cls: "bg-slate-500 text-white" },
};

function ExerciseRow({
  we,
  lib,
  onStatus,
  onMetrics,
  onRemove,
}: {
  we: WorkoutExercise;
  lib?: Exercise;
  onStatus: (s: ExerciseStatus) => void;
  onMetrics: (m: Metrics) => void;
  onRemove: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-start gap-3">
        {lib?.mediaUrl && (
          <ExerciseMediaThumb
            ex={lib}
            onClick={() => navigate(`/exercise/${lib.id}`)}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium">{we.name}</p>
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 text-xs text-slate-400 hover:text-red-500"
              aria-label="remove exercise"
            >
              Remove
            </button>
          </div>
          <p className="text-xs text-slate-500">{prescriptionSummary(we)}</p>

          <div className="mt-2 flex items-center gap-1.5">
            {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map(
              (s) => {
                const active = we.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onStatus(active ? "none" : s)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? STATUS_META[s].cls
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    <span>{STATUS_META[s].icon}</span>
                    {STATUS_META[s].label}
                  </button>
                );
              },
            )}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="ml-auto rounded-lg px-2 py-1 text-xs text-sky-600 dark:text-sky-400"
            >
              {open ? "Hide log" : "Log"}
            </button>
          </div>

          {open && <MetricsEntry we={we} onMetrics={onMetrics} />}
        </div>
      </div>
    </li>
  );
}

function MetricsEntry({
  we,
  onMetrics,
}: {
  we: WorkoutExercise;
  onMetrics: (m: Metrics) => void;
}) {
  const m = we.metrics ?? {};
  const num = (v: string): number | undefined =>
    v === "" ? undefined : Number(v);

  const field = (
    label: string,
    key: keyof Metrics,
    placeholder?: string,
  ) => (
    <label className="flex flex-col text-[11px] text-slate-500">
      {label}
      <input
        type="number"
        inputMode="decimal"
        defaultValue={m[key] ?? ""}
        placeholder={placeholder}
        onBlur={(e) => onMetrics({ [key]: num(e.target.value) } as Metrics)}
        className="mt-0.5 w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
    </label>
  );

  return (
    <div className="mt-2 flex flex-wrap gap-3 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
      {we.measureType === "reps" && (
        <>
          {field("Reps", "reps")}
          {field("Weight kg", "weight")}
        </>
      )}
      {we.measureType === "reps_in_time" &&
        field(`Reps / ${we.prescription?.windowSec ?? 10}s`, "reps")}
      {(we.measureType === "hold" || we.measureType === "duration") &&
        field("Seconds", "durationSec")}
      {field("RPE", "rpe", "1-10")}
    </div>
  );
}

// Re-export a factory used by AddExercisePanel to build workout exercises.
export function workoutExerciseFromLibrary(lib: Exercise): WorkoutExercise {
  return {
    id: uid(),
    exerciseId: lib.id,
    name: lib.name,
    category: lib.category,
    measureType: lib.measureType,
    prescription: {
      sets: lib.defaultSets,
      reps: lib.defaultReps,
      windowSec: lib.defaultWindowSec,
      holdSec: lib.defaultHoldSec,
    },
    status: "none",
  };
}
