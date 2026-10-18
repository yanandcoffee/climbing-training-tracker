import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  CheckIn,
  DayColor,
  Exercise,
  Metrics,
  MeasureType,
  ExerciseStatus,
  ScheduleEntry,
  Settings,
  Snapshot,
  Workout,
  WorkoutTemplate,
} from "../types";
import { uid } from "../lib/id";
import { scoreForCheckIn } from "../lib/scoring";
import { isEmptyWorkout, mergeBody, type WorkoutBody } from "../lib/workoutPlan";
import { shortDate } from "../lib/dates";
import { LocalStorageAdapter } from "../storage/LocalStorageAdapter";
import {
  emptySnapshot,
  normalizeSnapshot,
  SNAPSHOT_VERSION,
  type StorageAdapter,
} from "../storage/StorageAdapter";
import { mergeRows, SYNCED_SETTING_KEYS, type Row } from "../sync/engine";

const adapter: StorageAdapter = new LocalStorageAdapter();

/**
 * One undoable change: the previous version of each record it touched
 * (null = the change created it). In memory only; a reload starts fresh.
 */
export interface UndoStep {
  id: number;
  label: string;
  exercises: Record<string, Exercise | null>;
  workouts: Record<string, Workout | null>;
}

/** Undo label: a short description, or false for automatic repairs that shouldn't be undoable. */
type Label = string | false;

interface State {
  loaded: boolean;
  /** Most recent last. */
  undoStack: UndoStep[];
  checkIns: CheckIn[];
  exercises: Exercise[];
  workouts: Workout[];
  /** Retired features; kept only so previously stored/synced data survives. */
  templates: WorkoutTemplate[];
  schedule: ScheduleEntry[];
  settings: Settings;

  hydrate: () => Promise<void>;

  upsertCheckIn: (
    date: string,
    data: { color: DayColor; quality: number; note?: string },
  ) => void;

  addExercise: (data: Omit<Exercise, keyof SyncedKeys>, label?: Label) => Exercise;
  updateExercise: (id: string, patch: Partial<Exercise>, label?: Label) => void;
  deleteExercise: (id: string) => void;
  /** Switch every workout entry of a library exercise to one measure type. */
  retypeExerciseEntries: (exerciseId: string, measureType: MeasureType) => void;

  getOrCreateWorkoutForDate: (date: string) => Workout;
  saveWorkout: (workout: Workout, label?: Label) => void;
  /** Put a workout's content (imported or copied) onto each of `dates`. */
  applyWorkoutToDates: (
    body: WorkoutBody,
    dates: string[],
    mode: "replace" | "append",
    label?: Label,
  ) => void;
  /**
   * Reschedule `from`'s workout onto `to`, keeping its marks and logged numbers.
   * If `to` already has a workout: "swap" puts that one on `from`; "append"
   * adds the moved workout to it.
   */
  moveWorkout: (from: string, to: string, mode: MoveMode) => void;
  setExerciseStatus: (
    workoutId: string,
    exerciseId: string,
    status: ExerciseStatus,
  ) => void;
  setExerciseMetrics: (
    workoutId: string,
    exerciseId: string,
    metrics: Metrics,
  ) => void;

  /** Put back the records the latest change touched. */
  undo: () => void;

  setSettings: (patch: Partial<Settings>) => void;
  /** Replace settings with a version reconciled from the account (no re-stamp). */
  applyRemoteSettings: (settings: Settings) => void;

  exportSnapshot: () => Snapshot;
  importSnapshot: (snapshot: Snapshot) => void;
  /** Merge rows pulled from the cloud (newer updatedAt wins). */
  applyRemote: (rows: Row[]) => void;
  clearAll: () => void;
}

export type MoveMode = "swap" | "append";

type SyncedKeys = { id: string; updatedAt: number; deletedAt?: number };

function stamp<T extends SyncedKeys>(partial: Omit<T, keyof SyncedKeys>): T {
  return { ...(partial as object), id: uid(), updatedAt: Date.now() } as T;
}

function snapshotOf(s: State): Snapshot {
  return {
    version: SNAPSHOT_VERSION,
    checkIns: s.checkIns,
    exercises: s.exercises,
    workouts: s.workouts,
    templates: s.templates,
    schedule: s.schedule,
    settings: s.settings,
  };
}

/** The previous version of each record that `next` adds or changes (by reference). */
function changedFrom<T extends SyncedKeys>(prev: T[], next: T[]): Record<string, T | null> {
  const byId = new Map(prev.map((r) => [r.id, r]));
  const out: Record<string, T | null> = {};
  for (const r of next) {
    const before = byId.get(r.id);
    if (before !== r) out[r.id] = before ?? null;
  }
  return out;
}

const UNDO_LIMIT = 50;
let undoIds = 0;

export const useStore = create<State>((set, get) => {
  // Persist after any mutation. `partial` is the state slice to merge.
  // Never before hydrate() has loaded: the store starts empty, and saving it
  // then would overwrite everything stored on this device (this happened when
  // a dev hot-reload re-created the store and a day view auto-created a workout).
  const persist = (partial: Partial<State>) => {
    set(partial);
    if (get().loaded) void adapter.save(snapshotOf(get()));
  };

  // Changes made in one go (e.g. a new library exercise and the workout it's
  // added to) share one undo step: it stays open until the current task ends.
  let openStep: UndoStep | null = null;
  const persistUndoable = (label: Label, partial: Pick<Partial<State>, "exercises" | "workouts">) => {
    if (label === false) return persist(partial);
    const exercises = partial.exercises ? changedFrom(get().exercises, partial.exercises) : {};
    const workouts = partial.workouts ? changedFrom(get().workouts, partial.workouts) : {};
    if (!Object.keys(exercises).length && !Object.keys(workouts).length) return persist(partial);
    let undoStack = get().undoStack;
    if (openStep && undoStack[undoStack.length - 1] === openStep) {
      // Keep the oldest version of each record: undo goes back to before the whole group.
      openStep = {
        ...openStep,
        label,
        exercises: { ...exercises, ...openStep.exercises },
        workouts: { ...workouts, ...openStep.workouts },
      };
      undoStack = [...undoStack.slice(0, -1), openStep];
    } else {
      openStep = { id: ++undoIds, label, exercises, workouts };
      undoStack = [...undoStack, openStep].slice(-UNDO_LIMIT);
      setTimeout(() => (openStep = null), 0);
    }
    persist({ ...partial, undoStack });
  };

  return {
    loaded: false,
    undoStack: [],
    ...emptySnapshot(),

    hydrate: async () => {
      const snap = (await adapter.load()) ?? emptySnapshot();
      set({
        loaded: true,
        undoStack: [],
        checkIns: snap.checkIns,
        exercises: snap.exercises,
        workouts: snap.workouts,
        templates: snap.templates,
        schedule: snap.schedule,
        settings: snap.settings,
      });
    },

    upsertCheckIn: (date, data) => {
      const points = scoreForCheckIn(data.color, data.quality);
      const existing = get().checkIns.find((c) => c.date === date && !c.deletedAt);
      let checkIns: CheckIn[];
      if (existing) {
        checkIns = get().checkIns.map((c) =>
          c.id === existing.id
            ? { ...c, ...data, points, updatedAt: Date.now() }
            : c,
        );
      } else {
        // Natural key: one check-in per date, so two devices edit the same record.
        checkIns = [
          ...get().checkIns,
          { ...stamp<CheckIn>({ date, ...data, points }), id: `ci-${date}` },
        ];
      }
      persist({ checkIns });
    },

    addExercise: (data, label = `Added ${data.name}`) => {
      const ex = stamp<Exercise>(data);
      persistUndoable(label, { exercises: [...get().exercises, ex] });
      return ex;
    },
    updateExercise: (id, patch, label) =>
      persistUndoable(label ?? `Edited ${get().exercises.find((e) => e.id === id)?.name ?? "exercise"}`, {
        exercises: get().exercises.map((e) =>
          e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e,
        ),
      }),
    deleteExercise: (id) =>
      persistUndoable(`Deleted ${get().exercises.find((e) => e.id === id)?.name ?? "exercise"}`, {
        exercises: get().exercises.map((e) =>
          e.id === id ? { ...e, deletedAt: Date.now(), updatedAt: Date.now() } : e,
        ),
      }),
    retypeExerciseEntries: (exerciseId, measureType) => {
      const now = Date.now();
      const name = get().exercises.find((e) => e.id === exerciseId)?.name ?? "exercise";
      persistUndoable(`Changed the type of every ${name}`, {
        workouts: get().workouts.map((w) =>
          !w.deletedAt && w.exercises.some((e) => e.exerciseId === exerciseId && e.measureType !== measureType)
            ? {
                ...w,
                updatedAt: now,
                exercises: w.exercises.map((e) =>
                  e.exerciseId === exerciseId ? { ...e, measureType } : e,
                ),
              }
            : w,
        ),
      });
    },

    getOrCreateWorkoutForDate: (date) => {
      const found = get().workouts.find((w) => w.date === date && !w.deletedAt);
      if (found) return found;

      // Natural key (one workout per date). updatedAt 0 = "auto-created, never
      // edited": any real version from another device always wins the merge, and
      // the first genuine edit (saveWorkout) stamps a real time.
      const workout: Workout = {
        ...stamp<Workout>({ date, sections: [], exercises: [] }),
        id: `wo-${date}`,
        updatedAt: 0,
      };
      persist({ workouts: [...get().workouts, workout] });
      return workout;
    },

    saveWorkout: (workout, label = "Changed workout") => {
      const exists = get().workouts.some((w) => w.id === workout.id);
      const updated = { ...workout, updatedAt: Date.now() };
      persistUndoable(label, {
        workouts: exists
          ? get().workouts.map((w) => (w.id === workout.id ? updated : w))
          : [...get().workouts, updated],
      });
    },

    applyWorkoutToDates: (body, dates, mode, label = "Filled in workout") => {
      const now = Date.now();
      let workouts = get().workouts;
      for (const date of new Set(dates)) {
        const existing = workouts.find((w) => w.date === date && !w.deletedAt);
        const merged = mergeBody(
          existing
            ? { name: existing.name, sections: existing.sections ?? [], exercises: existing.exercises }
            : { sections: [], exercises: [] },
          body,
          mode,
        );
        const next: Workout = {
          id: existing?.id ?? `wo-${date}`,
          date,
          name: merged.name,
          sections: merged.sections,
          exercises: merged.exercises,
          updatedAt: now,
        };
        workouts = existing
          ? workouts.map((w) => (w.id === existing.id ? next : w))
          : [...workouts, next];
      }
      persistUndoable(label, { workouts });
    },

    moveWorkout: (from, to, mode) => {
      if (from === to) return;
      const find = (date: string) => get().workouts.find((w) => w.date === date && !w.deletedAt);
      const src = find(from);
      if (!src || isEmptyWorkout(src)) return;
      const dst = find(to);
      const body = (w: Workout | undefined): WorkoutBody => ({
        name: w?.name,
        sections: w?.sections ?? [],
        exercises: w?.exercises ?? [],
      });
      const occupied = !isEmptyWorkout(dst);
      const toBody =
        occupied && mode === "append" ? mergeBody(body(dst), body(src), "append", true) : body(src);
      const fromBody = occupied && mode === "swap" ? body(dst) : body(undefined);
      const now = Date.now();
      const write = (workouts: Workout[], date: string, existing: Workout | undefined, b: WorkoutBody) => {
        const next: Workout = { id: existing?.id ?? `wo-${date}`, date, ...b, updatedAt: now };
        return existing ? workouts.map((w) => (w.id === existing.id ? next : w)) : [...workouts, next];
      };
      const label = !occupied
        ? `Moved workout to ${shortDate(to)}`
        : mode === "swap"
          ? `Swapped ${shortDate(from)} and ${shortDate(to)}`
          : `Added workout to ${shortDate(to)}`;
      persistUndoable(label, { workouts: write(write(get().workouts, to, dst, toBody), from, src, fromBody) });
    },

    setExerciseStatus: (workoutId, exerciseId, status) =>
      persistUndoable("Marked exercise", {
        workouts: get().workouts.map((w) =>
          w.id === workoutId
            ? {
                ...w,
                updatedAt: Date.now(),
                exercises: w.exercises.map((e) =>
                  e.id === exerciseId ? { ...e, status } : e,
                ),
              }
            : w,
        ),
      }),

    setExerciseMetrics: (workoutId, exerciseId, metrics) =>
      persistUndoable("Logged exercise", {
        workouts: get().workouts.map((w) =>
          w.id === workoutId
            ? {
                ...w,
                updatedAt: Date.now(),
                exercises: w.exercises.map((e) =>
                  e.id === exerciseId
                    ? { ...e, metrics: { ...e.metrics, ...metrics } }
                    : e,
                ),
              }
            : w,
        ),
      }),

    undo: () => {
      const stack = get().undoStack;
      const step = stack[stack.length - 1];
      if (!step) return;
      if (openStep === step) openStep = null;
      // Re-stamped as a new edit, so the undo also wins on other devices.
      const now = Date.now();
      const exercises = get().exercises.map((e) => {
        if (!(e.id in step.exercises)) return e;
        const before = step.exercises[e.id];
        return before ? { ...before, updatedAt: now } : { ...e, deletedAt: now, updatedAt: now };
      });
      // A workout the change created goes back to an empty day (one record per date).
      const workouts = get().workouts.map((w) => {
        if (!(w.id in step.workouts)) return w;
        const before = step.workouts[w.id];
        return before
          ? { ...before, updatedAt: now }
          : { ...w, name: undefined, sections: [], exercises: [], updatedAt: now };
      });
      persist({ exercises, workouts, undoStack: stack.slice(0, -1) });
    },

    setSettings: (patch) => {
      // Stamp changes to the account-synced AI settings so the newest edit wins.
      // Only real changes count — re-saving the same value must not make this
      // device's copy "newer" than the account's.
      const current = get().settings;
      const touchesSynced = (Object.keys(patch) as (keyof Settings)[]).some(
        (k) =>
          ((SYNCED_SETTING_KEYS as readonly string[]).includes(k) || k === "syncApiKeys") &&
          patch[k] !== current[k],
      );
      persist({
        settings: {
          ...get().settings,
          ...patch,
          ...(touchesSynced ? { settingsUpdatedAt: Date.now() } : {}),
        },
      });
    },
    applyRemoteSettings: (settings) => persist({ settings }),

    exportSnapshot: () => snapshotOf(get()),
    importSnapshot: (snapshot) => {
      const s = normalizeSnapshot({ ...emptySnapshot(), ...snapshot });
      persist({
        undoStack: [],
        checkIns: s.checkIns,
        exercises: s.exercises,
        workouts: s.workouts,
        templates: s.templates,
        schedule: s.schedule,
        settings: { ...get().settings, ...(snapshot.settings ?? {}) },
      });
    },
    applyRemote: (rows) => {
      const { snapshot, changed } = mergeRows(snapshotOf(get()), rows);
      if (!changed) return; // no-op merges must not re-notify subscribers (would loop sync)
      persist({
        checkIns: snapshot.checkIns,
        exercises: snapshot.exercises,
        workouts: snapshot.workouts,
        templates: snapshot.templates,
        schedule: snapshot.schedule,
      });
    },
    clearAll: () => {
      const base = emptySnapshot();
      persist({
        undoStack: [],
        checkIns: [],
        exercises: [],
        workouts: [],
        templates: [],
        schedule: [],
        settings: base.settings,
      });
    },
  };
});

// ---- Selectors (plain helpers; filter tombstones) --------------------------

export const activeExercises = (s: State) =>
  s.exercises.filter((e) => !e.deletedAt);
export const activeCheckIns = (s: State) =>
  s.checkIns.filter((c) => !c.deletedAt);
export const activeWorkouts = (s: State) =>
  s.workouts.filter((w) => !w.deletedAt);

export const checkInForDate = (s: State, date: string) =>
  s.checkIns.find((c) => c.date === date && !c.deletedAt);

// ---- Memoized hooks ---------------------------------------------------------
// These selectors build NEW arrays each call; under zustand v5 (useSyncExternalStore)
// that loops unless the result is referentially stabilized. useShallow caches by
// shallow equality so the reference only changes when the contents actually do.

export const useActiveExercises = () => useStore(useShallow(activeExercises));
export const useActiveCheckIns = () => useStore(useShallow(activeCheckIns));
export const useActiveWorkouts = () => useStore(useShallow(activeWorkouts));
