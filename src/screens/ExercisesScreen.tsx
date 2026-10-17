import { useState } from "react";
import { Link } from "react-router-dom";
import type { Exercise, ExerciseCategory } from "../types";
import { CATEGORY_LABELS, CATEGORY_ORDER, MEASURE_LABELS } from "../types";
import { useActiveExercises, useStore } from "../store/useStore";
import ExerciseForm, { type ExerciseDraft } from "../components/ExerciseForm";
import { ExerciseMediaThumb } from "../components/ExerciseMedia";
import { UndoInlineButton } from "../components/UndoButton";

export default function ExercisesScreen() {
  const exercises = useActiveExercises();
  const addExercise = useStore((s) => s.addExercise);
  const updateExercise = useStore((s) => s.updateExercise);
  const deleteExercise = useStore((s) => s.deleteExercise);

  const [filter, setFilter] = useState<ExerciseCategory | "all">("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const save = (draft: ExerciseDraft) => {
    addExercise(draft);
    setAdding(false);
  };

  const cats = filter === "all" ? CATEGORY_ORDER : [filter];

  return (
    <div className="space-y-4 py-4">
      <header className="flex min-h-16 items-center justify-between">
        <h1 className="text-xl font-bold">Exercises</h1>
        <div className="flex gap-2">
          <UndoInlineButton className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" />
          <button
            type="button"
            onClick={() => {
              setAdding((v) => !v);
              setEditing(null);
            }}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            {adding ? "Close" : "+ New"}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterChip>
        {CATEGORY_ORDER.map((c) => (
          <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)}>
            {shortCat(c)}
          </FilterChip>
        ))}
      </div>

      {adding && <ExerciseForm onSave={save} onCancel={() => setAdding(false)} />}

      {exercises.length === 0 && !adding && (
        <p className="py-10 text-center text-sm text-slate-400">
          No exercises yet. Tap <span className="font-semibold">+ New</span>, or import a
          coach's note from any day in the Calendar — its exercises are added here.
        </p>
      )}

      <div className="space-y-5">
        {cats.map((cat) => {
          const items = exercises.filter((e) => e.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {CATEGORY_LABELS[cat]}
              </h2>
              <ul className="space-y-2">
                {items.map((ex) =>
                  editing === ex.id ? (
                    <li key={ex.id}>
                      <ExerciseForm
                        initial={ex}
                        onSave={(draft) => {
                          updateExercise(ex.id, draft);
                          setEditing(null);
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    </li>
                  ) : (
                    <Row
                      key={ex.id}
                      ex={ex}
                      onEdit={() => {
                        setEditing(ex.id);
                        setAdding(false);
                      }}
                      onDuplicate={() => {
                        // A copy to rename right away, e.g. "Repeaters 20mm" → "Repeaters 15mm".
                        const { id: _id, updatedAt: _u, deletedAt: _d, ...rest } = ex;
                        void [_id, _u, _d];
                        const copy = addExercise({ ...rest, name: `${ex.name} (copy)` }, `Duplicated ${ex.name}`);
                        setEditing(copy.id);
                        setAdding(false);
                      }}
                      onDelete={() => {
                        if (confirm(`Delete "${ex.name}"?`)) deleteExercise(ex.id);
                      }}
                    />
                  ),
                )}
              </ul>
            </div>
          );
        })}
      </div>

    </div>
  );
}

function Row({
  ex,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  ex: Exercise;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-200 p-2.5 dark:border-slate-700">
      <ExerciseMediaThumb ex={ex} />
      <Link to={`/exercise/${ex.id}`} className="min-w-0 flex-1">
        <p className="truncate font-medium">{ex.name}</p>
        <p className="text-xs text-slate-500">{MEASURE_LABELS[ex.measureType]}</p>
      </Link>
      <button
        type="button"
        onClick={onEdit}
        className="text-xs text-sky-600 dark:text-sky-400"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onDuplicate}
        className="text-xs text-sky-600 dark:text-sky-400"
      >
        Duplicate
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-slate-400 hover:text-red-500"
      >
        Delete
      </button>
    </li>
  );
}

function FilterChip({
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
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? "bg-sky-600 text-white"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function shortCat(c: ExerciseCategory): string {
  return {
    warm_up: "Warm up",
    on_wall_drills: "On-wall",
    strength_conditioning: "Strength",
    core: "Core",
    mobility: "Mobility",
  }[c];
}
