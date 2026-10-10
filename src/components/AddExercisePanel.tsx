import { useState } from "react";
import type {
  Exercise,
  ExerciseCategory,
  MeasureType,
  WorkoutExercise,
} from "../types";
import { CATEGORY_LABELS, CATEGORY_ORDER, MEASURE_LABELS } from "../types";
import { uid } from "../lib/id";
import { workoutExerciseFromLibrary } from "./WorkoutDayView";

const MEASURES: MeasureType[] = ["reps", "reps_in_time", "hold", "duration"];

export default function AddExercisePanel({
  library,
  onAdd,
  onClose,
}: {
  library: Exercise[];
  onAdd: (we: WorkoutExercise) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"library" | "custom">(
    library.length ? "library" : "custom",
  );

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="mb-3 flex gap-2">
        <TabBtn active={tab === "library"} onClick={() => setTab("library")}>
          From library
        </TabBtn>
        <TabBtn active={tab === "custom"} onClick={() => setTab("custom")}>
          Custom
        </TabBtn>
      </div>

      {tab === "library" ? (
        <LibraryPicker library={library} onPick={(lib) => onAdd(workoutExerciseFromLibrary(lib))} />
      ) : (
        <CustomAdd
          onAdd={(we) => {
            onAdd(we);
            onClose();
          }}
        />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        active
          ? "bg-sky-600 text-white"
          : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function LibraryPicker({
  library,
  onPick,
}: {
  library: Exercise[];
  onPick: (lib: Exercise) => void;
}) {
  if (library.length === 0) {
    return (
      <p className="py-3 text-center text-sm text-slate-400">
        Your library is empty. Add exercises on the Exercises tab, or use Custom.
      </p>
    );
  }
  return (
    <div className="max-h-64 space-y-3 overflow-y-auto">
      {CATEGORY_ORDER.map((cat) => {
        const items = library.filter((e) => e.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {CATEGORY_LABELS[cat]}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {items.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onPick(e)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  + {e.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CustomAdd({ onAdd }: { onAdd: (we: WorkoutExercise) => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ExerciseCategory>("on_wall_drills");
  const [measureType, setMeasureType] = useState<MeasureType>("reps");

  return (
    <div className="space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Exercise name"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ExerciseCategory)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select
          value={measureType}
          onChange={(e) => setMeasureType(e.target.value as MeasureType)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {MEASURES.map((m) => (
            <option key={m} value={m}>
              {MEASURE_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() =>
          onAdd({
            id: uid(),
            name: name.trim(),
            category,
            measureType,
            prescription:
              measureType === "reps_in_time"
                ? { sets: 1, windowSec: 10 }
                : measureType === "hold"
                  ? { sets: 1, holdSec: 20 }
                  : { sets: 3, reps: 8 },
            status: "none",
          })
        }
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
      >
        Add to workout
      </button>
    </div>
  );
}
