import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  CheckIn,
  DayColor,
  Exercise,
  Metrics,
  ExerciseStatus,
  ScheduleEntry,
  Settings,
  Snapshot,
  Workout,
  WorkoutExercise,
  WorkoutTemplate,
  TemplateExercise,
} from "../types";
import { uid } from "../lib/id";
import { scoreForCheckIn } from "../lib/scoring";
import { weekdayOf } from "../lib/dates";
import { LocalStorageAdapter } from "../storage/LocalStorageAdapter";
import {
  emptySnapshot,
  normalizeSnapshot,
  SNAPSHOT_VERSION,
  type StorageAdapter,
} from "../storage/StorageAdapter";
import { mergeRows, type Row } from "../sync/engine";

const adapter: StorageAdapter = new LocalStorageAdapter();

interface State {
  loaded: boolean;
  checkIns: CheckIn[];
  exercises: Exercise[];
  workouts: Workout[];
  templates: WorkoutTemplate[];
  schedule: ScheduleEntry[];
  settings: Settings;

  hydrate: () => Promise<void>;

  upsertCheckIn: (
    date: string,
    data: { color: DayColor; quality: number; note?: string },
  ) => void;

  addExercise: (data: Omit<Exercise, keyof SyncedKeys>) => Exercise;
  updateExercise: (id: string, patch: Partial<Exercise>) => void;
  deleteExercise: (id: string) => void;

  addTemplate: (name: string, exercises: TemplateExercise[]) => WorkoutTemplate;
  updateTemplate: (id: string, patch: Partial<WorkoutTemplate>) => void;
  deleteTemplate: (id: string) => void;

  addScheduleEntry: (entry: Omit<ScheduleEntry, keyof SyncedKeys>) => void;
  deleteScheduleEntry: (id: string) => void;

  getOrCreateWorkoutForDate: (date: string) => Workout;
  saveWorkout: (workout: Workout) => void;
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

  setSettings: (patch: Partial<Settings>) => void;

  exportSnapshot: () => Snapshot;
  importSnapshot: (snapshot: Snapshot) => void;
  /** Merge rows pulled from the cloud (newer updatedAt wins). */
  applyRemote: (rows: Row[]) => void;
  clearAll: () => void;
}

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

export const useStore = create<State>((set, get) => {
  // Persist after any mutation. `partial` is the state slice to merge.
  const persist = (partial: Partial<State>) => {
    set(partial);
    void adapter.save(snapshotOf(get()));
  };

  return {
    loaded: false,
    ...emptySnapshot(),

    hydrate: async () => {
      const snap = (await adapter.load()) ?? emptySnapshot();
      set({
        loaded: true,
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

    addExercise: (data) => {
      const ex = stamp<Exercise>(data);
      persist({ exercises: [...get().exercises, ex] });
      return ex;
    },
    updateExercise: (id, patch) =>
      persist({
        exercises: get().exercises.map((e) =>
          e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e,
        ),
      }),
    deleteExercise: (id) =>
      persist({
        exercises: get().exercises.map((e) =>
          e.id === id ? { ...e, deletedAt: Date.now(), updatedAt: Date.now() } : e,
        ),
      }),

    addTemplate: (name, exercises) => {
      const t = stamp<WorkoutTemplate>({ name, exercises });
      persist({ templates: [...get().templates, t] });
      return t;
    },
    updateTemplate: (id, patch) =>
      persist({
        templates: get().templates.map((t) =>
          t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t,
        ),
      }),
    deleteTemplate: (id) =>
      persist({
        templates: get().templates.map((t) =>
          t.id === id ? { ...t, deletedAt: Date.now(), updatedAt: Date.now() } : t,
        ),
      }),

    addScheduleEntry: (entry) =>
      persist({ schedule: [...get().schedule, stamp<ScheduleEntry>(entry)] }),
    deleteScheduleEntry: (id) =>
      persist({
        schedule: get().schedule.map((s) =>
          s.id === id ? { ...s, deletedAt: Date.now(), updatedAt: Date.now() } : s,
        ),
      }),

    getOrCreateWorkoutForDate: (date) => {
      const found = get().workouts.find((w) => w.date === date && !w.deletedAt);
      if (found) return found;

      // Materialize from schedule: a one-off date entry wins over weekday recurrence.
      const sched = get().schedule.filter((s) => !s.deletedAt);
      const dateEntry = sched.find((s) => s.date === date);
      const wd = weekdayOf(date);
      const weekdayEntry = sched.find((s) => s.weekday === wd && !s.date);
      const entry = dateEntry ?? weekdayEntry;

      let exercises: WorkoutExercise[] = [];
      let name: string | undefined;
      if (entry) {
        const tpl = get().templates.find((t) => t.id === entry.templateId && !t.deletedAt);
        if (tpl) {
          name = tpl.name;
          exercises = tpl.exercises.map((te) => ({
            ...te,
            id: uid(),
            status: "none" as ExerciseStatus,
          }));
        }
      }
      // Natural key (one workout per date). updatedAt 0 = "auto-created, never
      // edited": any real version from another device always wins the merge, and
      // the first genuine edit (saveWorkout) stamps a real time.
      const workout: Workout = {
        ...stamp<Workout>({ date, name, exercises }),
        id: `wo-${date}`,
        updatedAt: 0,
      };
      persist({ workouts: [...get().workouts, workout] });
      return workout;
    },

    saveWorkout: (workout) => {
      const exists = get().workouts.some((w) => w.id === workout.id);
      const updated = { ...workout, updatedAt: Date.now() };
      persist({
        workouts: exists
          ? get().workouts.map((w) => (w.id === workout.id ? updated : w))
          : [...get().workouts, updated],
      });
    },

    setExerciseStatus: (workoutId, exerciseId, status) =>
      persist({
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
      persist({
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

    setSettings: (patch) =>
      persist({ settings: { ...get().settings, ...patch } }),

    exportSnapshot: () => snapshotOf(get()),
    importSnapshot: (snapshot) => {
      const s = normalizeSnapshot({ ...emptySnapshot(), ...snapshot });
      persist({
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
export const activeTemplates = (s: State) =>
  s.templates.filter((t) => !t.deletedAt);
export const activeSchedule = (s: State) =>
  s.schedule.filter((e) => !e.deletedAt);
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
export const useActiveTemplates = () => useStore(useShallow(activeTemplates));
export const useActiveSchedule = () => useStore(useShallow(activeSchedule));
export const useActiveCheckIns = () => useStore(useShallow(activeCheckIns));
export const useActiveWorkouts = () => useStore(useShallow(activeWorkouts));
