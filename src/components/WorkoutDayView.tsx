import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  Exercise,
  ExerciseStatus,
  Metrics,
  Workout,
  WorkoutExercise,
  WorkoutSection,
} from "../types";
import { activeWorkouts, useActiveExercises, useActiveWorkouts, useStore } from "../store/useStore";
import {
  groupItems,
  isEmptyWorkout,
  lastUseOf,
  prescriptionSummary,
} from "../lib/workoutPlan";
import { shortDate } from "../lib/dates";
import { ExerciseMediaThumb } from "./ExerciseMedia";
import AddExercisePanel from "./AddExercisePanel";
import PrescriptionEditor from "./PrescriptionEditor";
import ImportNotesDialog from "./ImportNotesDialog";
import CopyWorkoutDialog from "./CopyWorkoutDialog";

type Dialog = "import" | "copyFrom" | "copyTo" | null;

const card =
  "rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

export default function WorkoutDayView({ date }: { date: string }) {
  const getOrCreate = useStore((s) => s.getOrCreateWorkoutForDate);
  const workout = useStore((s) => activeWorkouts(s).find((w) => w.date === date));
  const library = useActiveExercises();
  const workouts = useActiveWorkouts();
  const saveWorkout = useStore((s) => s.saveWorkout);
  const addExercise = useStore((s) => s.addExercise);

  const [adding, setAdding] = useState<{ sectionId?: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Lazily create the (empty) workout record for this day when it's opened.
  useEffect(() => {
    getOrCreate(date);
  }, [date, getOrCreate]);

  if (!workout) {
    return (
      <section className={card}>
        <p className="text-sm text-slate-400">Preparing workout…</p>
      </section>
    );
  }

  // Always edit the latest stored version, so rapid successive edits never drop each other.
  const update = (fn: (w: Workout) => Workout) => {
    const latest = activeWorkouts(useStore.getState()).find((w) => w.date === date) ?? workout;
    saveWorkout(fn(latest));
  };
  const updateItem = (id: string, patch: Partial<WorkoutExercise>) =>
    update((w) => ({
      ...w,
      exercises: w.exercises.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  const removeItem = (id: string) =>
    update((w) => ({ ...w, exercises: w.exercises.filter((e) => e.id !== id) }));
  const moveItem = (id: string, dir: -1 | 1) =>
    update((w) => {
      const list = [...w.exercises];
      const i = list.findIndex((e) => e.id === id);
      if (i < 0) return w;
      // Swap with the nearest neighbour in the same section.
      let j = i + dir;
      while (j >= 0 && j < list.length && (list[j].sectionId ?? "") !== (list[i].sectionId ?? "")) j += dir;
      if (j < 0 || j >= list.length) return w;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...w, exercises: list };
    });
  const renameSection = (id: string, title: string) =>
    update((w) => ({
      ...w,
      sections: (w.sections ?? []).map((s) => (s.id === id ? { ...s, title } : s)),
    }));
  const deleteSection = (id: string) =>
    update((w) => ({
      ...w,
      sections: (w.sections ?? []).filter((s) => s.id !== id),
      exercises: w.exercises.filter((e) => e.sectionId !== id),
    }));

  const sections = workout.sections ?? [];
  const sectionIds = new Set(sections.map((s) => s.id));
  const unsectioned = workout.exercises.filter((e) => !e.sectionId || !sectionIds.has(e.sectionId));
  const exById = new Map(library.map((e) => [e.id, e]));
  const earlier = workouts.filter((w) => w.date < date);
  const empty = isEmptyWorkout(workout);
  const done = workout.exercises.filter((e) => e.status === "complete").length;

  const dialogs = (
    <>
      {dialog === "import" && <ImportNotesDialog initialDate={date} onClose={() => setDialog(null)} />}
      {(dialog === "copyFrom" || dialog === "copyTo") && (
        <CopyWorkoutDialog
          date={date}
          direction={dialog === "copyFrom" ? "from" : "to"}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );

  const addPanel = adding && (
    <AddExercisePanel
      date={date}
      library={library}
      workouts={workouts}
      sections={sections}
      defaultSectionId={adding.sectionId}
      onCreateExercise={(data) => addExercise(data)}
      onAdd={(item, newSection) => {
        update((w) => ({
          ...w,
          sections: newSection ? [...(w.sections ?? []), newSection] : w.sections,
          exercises: [...w.exercises, item],
        }));
        setOpenId(item.id);
      }}
      onClose={() => setAdding(null)}
    />
  );

  if (empty) {
    return (
      <section className={card}>
        <h2 className="mb-1 text-base font-semibold">Workout</h2>
        <p className="mb-3 text-sm text-slate-500">Nothing planned for {shortDate(date)} yet.</p>
        {addPanel || (
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setDialog("import")}
              className="rounded-xl bg-sky-600 px-4 py-3 text-left text-white"
            >
              <span className="block font-medium">📋 Import coach's note</span>
              <span className="block text-xs opacity-80">Paste a note; it becomes this day's workout</span>
            </button>
            <button
              type="button"
              onClick={() => setDialog("copyFrom")}
              disabled={!workouts.some((w) => w.date !== date && !isEmptyWorkout(w))}
              className="rounded-xl border border-slate-200 px-4 py-3 text-left disabled:opacity-40 dark:border-slate-700"
            >
              <span className="block font-medium">⧉ Copy a previous workout</span>
              <span className="block text-xs text-slate-500">Autofill everything, then adjust sets/reps</span>
            </button>
            <button
              type="button"
              onClick={() => setAdding({})}
              className="rounded-xl border border-slate-200 px-4 py-3 text-left dark:border-slate-700"
            >
              <span className="block font-medium">＋ Build it exercise by exercise</span>
              <span className="block text-xs text-slate-500">Each one pre-fills from last time</span>
            </button>
          </div>
        )}
        {dialogs}
      </section>
    );
  }

  const renderItems = (items: WorkoutExercise[]) =>
    groupItems(items).map((g, gi) => (
      <div key={gi} className={g.group ? "mt-1" : ""}>
        {g.group && <p className="mb-1.5 text-xs font-semibold text-slate-500">{g.group}</p>}
        <ul className={`space-y-2 ${g.group ? "border-l-2 border-slate-100 pl-2 dark:border-slate-800" : ""}`}>
          {g.items.map((we) => (
            <ExerciseRow
              key={we.id}
              we={we}
              lib={we.exerciseId ? exById.get(we.exerciseId) : undefined}
              last={we.exerciseId ? lastUseOf(earlier, we.exerciseId) : undefined}
              open={openId === we.id}
              onToggleOpen={() => setOpenId((id) => (id === we.id ? null : we.id))}
              onChange={(patch) => updateItem(we.id, patch)}
              onRemove={() => removeItem(we.id)}
              onMove={(dir) => moveItem(we.id, dir)}
            />
          ))}
        </ul>
      </div>
    ));

  return (
    <section className={card}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <input
          key={`name-${workout.name ?? ""}`}
          defaultValue={workout.name ?? ""}
          placeholder="Workout"
          onBlur={(e) => {
            const v = e.target.value.trim() || undefined;
            if (v !== workout.name) update((w) => ({ ...w, name: v }));
          }}
          className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-slate-900 dark:placeholder:text-slate-100"
          aria-label="Workout name"
        />
        <span className="shrink-0 text-xs tabular-nums text-slate-500">
          {done}/{workout.exercises.length} done
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <ActionBtn primary onClick={() => setAdding(adding ? null : {})}>
          ＋ Exercise
        </ActionBtn>
        <ActionBtn onClick={() => setDialog("import")}>📋 Import note</ActionBtn>
        <ActionBtn onClick={() => setDialog("copyFrom")}>⧉ Copy from…</ActionBtn>
        <ActionBtn onClick={() => setDialog("copyTo")}>Copy to…</ActionBtn>
        {confirmClear ? (
          <span className="flex items-center gap-1 text-xs">
            <ActionBtn
              danger
              onClick={() => {
                update((w) => ({ ...w, name: undefined, sections: [], exercises: [] }));
                setConfirmClear(false);
              }}
            >
              Yes, clear day
            </ActionBtn>
            <ActionBtn onClick={() => setConfirmClear(false)}>Cancel</ActionBtn>
          </span>
        ) : (
          <ActionBtn onClick={() => setConfirmClear(true)}>Clear</ActionBtn>
        )}
      </div>

      {addPanel}

      <div className="space-y-5">
        {unsectioned.length > 0 && <div>{renderItems(unsectioned)}</div>}
        {sections.map((s) => (
          <SectionBlock
            key={s.id}
            section={s}
            hasItems={workout.exercises.some((e) => e.sectionId === s.id)}
            onRename={(t) => renameSection(s.id, t)}
            onDelete={() => deleteSection(s.id)}
            onAdd={() => setAdding({ sectionId: s.id })}
          >
            {renderItems(workout.exercises.filter((e) => e.sectionId === s.id))}
          </SectionBlock>
        ))}
      </div>
      {dialogs}
    </section>
  );
}

function ActionBtn({
  children,
  onClick,
  primary,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
        primary
          ? "bg-sky-600 text-white"
          : danger
            ? "bg-red-600 text-white"
            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function SectionBlock({
  section,
  hasItems,
  onRename,
  onDelete,
  onAdd,
  children,
}: {
  section: WorkoutSection;
  hasItems: boolean;
  onRename: (title: string) => void;
  onDelete: () => void;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        {editing ? (
          <input
            autoFocus
            defaultValue={section.title}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== section.title) onRename(v);
              setEditing(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
            title="Rename section"
          >
            {section.title}
          </button>
        )}
        <span className="flex shrink-0 gap-2 text-xs">
          <button type="button" onClick={onAdd} className="text-sky-600 dark:text-sky-400">
            ＋ Add
          </button>
          {!hasItems && (
            <button type="button" onClick={onDelete} className="text-slate-400 hover:text-red-500">
              Delete
            </button>
          )}
        </span>
      </div>
      {section.notes?.length ? (
        <ul className="mb-2 space-y-0.5 rounded-lg bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {section.notes.map((n, i) => (
            <li key={i}>💡 {n}</li>
          ))}
        </ul>
      ) : null}
      {children}
    </div>
  );
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
  last,
  open,
  onToggleOpen,
  onChange,
  onRemove,
  onMove,
}: {
  we: WorkoutExercise;
  lib?: Exercise;
  last?: ReturnType<typeof lastUseOf>;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (patch: Partial<WorkoutExercise>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const navigate = useNavigate();
  const summary = prescriptionSummary(we.measureType, we.prescription);

  return (
    <li className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-start gap-3">
        {lib?.mediaUrl && (
          <ExerciseMediaThumb ex={lib} onClick={() => navigate(`/exercise/${lib.id}`)} />
        )}
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onToggleOpen} className="block w-full text-left">
            <p className="font-medium">{we.name}</p>
            <p className="text-xs text-slate-500">
              {summary ? (
                <span className="font-medium text-slate-700 dark:text-slate-300">{summary}</span>
              ) : (
                <span className="italic">{we.measureType === "check" ? "Just do it" : "Tap to set target"}</span>
              )}
              {we.notes ? ` · ${we.notes}` : ""}
            </p>
          </button>

          <div className="mt-2 flex items-center gap-1.5">
            {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((s) => {
              const active = we.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ status: active ? "none" : s })}
                  aria-pressed={active}
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
            })}
            <button
              type="button"
              onClick={onToggleOpen}
              className="ml-auto rounded-lg px-2 py-1 text-xs text-sky-600 dark:text-sky-400"
              aria-expanded={open}
            >
              {open ? "Close" : "Edit / log"}
            </button>
          </div>

          {open && (
            <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60">
              {last && (
                <p className="text-[11px] text-slate-500">
                  Last time ({shortDate(last.date)}):{" "}
                  {prescriptionSummary(last.measureType, last.prescription) || "no target"}
                </p>
              )}
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Target for this workout
                </p>
                <PrescriptionEditor item={we} onChange={onChange} />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  What you did <span className="font-normal normal-case">(optional — “Done” counts the target)</span>
                </p>
                <MetricsEntry we={we} onMetrics={(m) => onChange({ metrics: { ...we.metrics, ...m } })} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex gap-1">
                  <button type="button" onClick={() => onMove(-1)} className="rounded bg-white px-2 py-1 dark:bg-slate-900" aria-label="Move up">
                    ↑
                  </button>
                  <button type="button" onClick={() => onMove(1)} className="rounded bg-white px-2 py-1 dark:bg-slate-900" aria-label="Move down">
                    ↓
                  </button>
                </span>
                <button type="button" onClick={onRemove} className="text-red-600 dark:text-red-400">
                  Remove from workout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function MetricsEntry({ we, onMetrics }: { we: WorkoutExercise; onMetrics: (m: Metrics) => void }) {
  const m = we.metrics ?? {};
  const unit = we.prescription?.weightUnit ?? "lb";
  const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));

  const field = (label: string, key: keyof Metrics, placeholder?: string) => (
    <label className="flex flex-col text-[11px] text-slate-500">
      {label}
      <input
        key={`${we.id}-m-${key}-${m[key] ?? ""}`}
        type="number"
        inputMode="decimal"
        defaultValue={m[key] ?? ""}
        placeholder={placeholder}
        onBlur={(e) => {
          const v = num(e.target.value);
          if (v !== m[key]) onMetrics({ [key]: v } as Metrics);
        }}
        className="mt-0.5 w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
    </label>
  );

  return (
    <div className="flex flex-wrap gap-3">
      {we.measureType === "reps" && (
        <>
          {field("Reps", "reps")}
          {field(`Weight ${unit}`, "weight")}
        </>
      )}
      {we.measureType === "reps_in_time" && field(`Reps / ${we.prescription?.windowSec ?? 10}s`, "reps")}
      {(we.measureType === "hold" || we.measureType === "duration") && (
        <>
          {field("Seconds", "durationSec")}
          {field(`Weight ${unit}`, "weight")}
        </>
      )}
      {field("RPE", "rpe", "1-10")}
    </div>
  );
}
