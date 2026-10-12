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
  WorkoutTemplate,
} from "../types";
import { uid } from "../lib/id";
import { scoreForCheckIn } from "../lib/scoring";
import { mergeBody, type WorkoutBody } from "../lib/workoutPlan";
import { LocalStorageAdapter } from "../storage/LocalStorageAdapter";
import {
  emptySnapshot,
  normalizeSnapshot,
  SNAPSHOT_VERSION,
  type StorageAdapter,
} from "../storage/StorageAdapter";
import { mergeRows, SYNCED_SETTING_KEYS, type Row } from "../sync/engine";

const adapter: StorageAdapter = new LocalStorageAdapter();

interface State {
  loaded: boolean;
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

  addExercise: (data: Omit<Exercise, keyof SyncedKeys>) => Exercise;
  updateExercise: (id: string, patch: Partial<Exercise>) => void;
  deleteExercise: (id: string) => void;

  getOrCreateWorkoutForDate: (date: string) => Workout;
  saveWorkout: (workout: Workout) => void;
  /** Put a workout's content (imported or copied) onto each of `dates`. */
  applyWorkoutToDates: (
    body: WorkoutBody,
    dates: string[],
    mode: "replace" | "append",
  ) => void;
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
  /** Replace settings with a version reconciled from the account (no re-stamp). */
  applyRemoteSettings: (settings: Settings) => void;

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

    saveWorkout: (workout) => {
      const exists = get().workouts.some((w) => w.id === workout.id);
      const updated = { ...workout, updatedAt: Date.now() };
      persist({
        workouts: exists
          ? get().workouts.map((w) => (w.id === workout.id ? updated : w))
          : [...get().workouts, updated],
      });
    },

    applyWorkoutToDates: (body, dates, mode) => {
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
      persist({ workouts });
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
