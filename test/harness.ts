// Headless verification of pure logic + the store's reducers/persistence.
import {
  scoreForCheckIn,
  pointOptions,
  qualityForPoints,
  nearestPointOption,
} from "../src/lib/scoring";
import { exerciseHistory, metricOptions } from "../src/lib/history";
import {
  useStore,
  activeWorkouts,
  checkInForDate,
} from "../src/store/useStore";
import type { WorkoutBody } from "../src/lib/workoutPlan";

// --- localStorage polyfill (store persists through it) ---------------------
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failures++;
  }
}

// --- Scoring bands match the spec ------------------------------------------
console.log("Scoring bands:");
assert(scoreForCheckIn("green", 0) === 1, "green min = +1");
assert(scoreForCheckIn("green", 1) === 5, "green max = +5");
assert(scoreForCheckIn("yellow", 0.5) === 0, "yellow = 0");
assert(scoreForCheckIn("orange", 0) === 0, "orange best = 0");
assert(scoreForCheckIn("orange", 1) === -2, "orange worst = -2");
assert(scoreForCheckIn("red", 0) === -3, "red best = -3");
assert(scoreForCheckIn("red", 1) === -5, "red worst = -5");
assert(scoreForCheckIn("black", 0) === -10, "black min severity = -10");
assert(scoreForCheckIn("black", 1) === -100, "black max severity = -100");

// --- Fixed point slots -----------------------------------------------------
console.log("Point slots:");
const eq = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
assert(eq(pointOptions("green"), [1, 2, 3, 4, 5]), "green slots +1..+5");
assert(eq(pointOptions("yellow"), [0]), "yellow single slot 0");
assert(eq(pointOptions("orange"), [0, -1, -2]), "orange slots 0,-1,-2");
assert(eq(pointOptions("red"), [-3, -4, -5]), "red slots -3,-4,-5");
assert(
  eq(pointOptions("black"), [-10, -20, -30, -40, -50, -60, -70, -80, -90, -100]),
  "black slots -10..-100 in tens",
);
for (const c of ["green", "orange", "red", "black"] as const) {
  assert(
    pointOptions(c).every((p) => scoreForCheckIn(c, qualityForPoints(c, p)) === p),
    `${c}: every slot round-trips through quality`,
  );
}
assert(nearestPointOption("black", -37) === -40, "stale value snaps to nearest slot");

// --- Loading guard ---------------------------------------------------------
// The store starts empty until hydrate() loads; saving before then would wipe
// this device's stored data (it happened via a dev hot-reload).
console.log("Loading guard:");
localStorage.setItem(
  "ctt.snapshot.v1",
  JSON.stringify({ version: 1, checkIns: [], exercises: [{ id: "kept", name: "Kept", category: "core", measureType: "reps", updatedAt: 5 }], workouts: [], templates: [], schedule: [], settings: {} }),
);
useStore.getState().getOrCreateWorkoutForDate("2026-01-01");
assert(localStorage.getItem("ctt.snapshot.v1")!.includes('"kept"'), "an edit before loading doesn't overwrite stored data");
await useStore.getState().hydrate();
assert(useStore.getState().exercises.some((e) => e.id === "kept"), "…which then loads intact");
useStore.getState().clearAll();

// --- Store flow ------------------------------------------------------------
console.log("Store flow:");
const s = useStore.getState();

const pullups = s.addExercise({
  name: "Weighted pull-ups",
  category: "strength_conditioning",
  measureType: "reps",
});
const maxhang = s.addExercise({
  name: "Max hang",
  category: "strength_conditioning",
  measureType: "hold",
});
assert(useStore.getState().exercises.length === 2, "two library exercises");

const date = "2026-02-03";

// A fresh day starts empty (no templates/schedule auto-fill any more).
const blank = s.getOrCreateWorkoutForDate(date);
assert(blank.exercises.length === 0 && blank.updatedAt === 0, "opening a day creates an empty, untouched workout");

// Apply an (imported or copied) workout to two days at once.
const body: WorkoutBody = {
  name: "Power day",
  sections: [{ id: "s1", title: "Strength" }],
  exercises: [
    {
      id: "a", exerciseId: pullups.id, sectionId: "s1", name: pullups.name, category: pullups.category,
      measureType: "reps", prescription: { sets: 4, reps: 5 }, status: "complete", metrics: { reps: 99 },
    },
    {
      id: "b", exerciseId: maxhang.id, sectionId: "s1", name: maxhang.name, category: maxhang.category,
      measureType: "hold", prescription: { sets: 5, holdSec: 10 }, status: "none",
    },
  ],
};
s.applyWorkoutToDates(body, [date, "2026-02-05"], "replace");
const workout = activeWorkouts(useStore.getState()).find((w) => w.date === date)!;
const other = activeWorkouts(useStore.getState()).find((w) => w.date === "2026-02-05")!;
assert(workout.exercises.length === 2 && other.exercises.length === 2, "workout applied to both selected days");
assert(workout.id === blank.id, "applying onto an existing day reuses its record (no duplicate)");
assert(workout.exercises.every((e) => e.status === "none" && !e.metrics), "applied copies start with fresh progress");
assert(workout.exercises[0].prescription?.reps === 5, "…but keep the prescription");
assert(
  workout.exercises.every((e) => workout.sections!.some((sec) => sec.id === e.sectionId)),
  "items stay linked to their (re-id'd) section",
);
assert(workout.exercises[0].id !== other.exercises[0].id, "each day gets its own item ids");

// Re-fetch should return the SAME workout (no duplicate creation)
const again = useStore.getState().getOrCreateWorkoutForDate(date);
assert(again.id === workout.id, "getOrCreate is idempotent for a date");
assert(activeWorkouts(useStore.getState()).length === 2, "exactly two workouts stored");

const weId = workout.exercises[0].id;
s.setExerciseStatus(workout.id, weId, "complete");
s.setExerciseMetrics(workout.id, weId, { reps: 5, weight: 20 });
{
  const w = activeWorkouts(useStore.getState()).find((x) => x.id === workout.id)!;
  const e = w.exercises.find((x) => x.id === weId)!;
  assert(e.status === "complete", "status set to complete");
  assert(e.metrics?.reps === 5 && e.metrics?.weight === 20, "metrics recorded");
}

// Check-ins (one per date, upsert replaces)
s.upsertCheckIn(date, { color: "green", quality: 1 });
assert(checkInForDate(useStore.getState(), date)?.points === 5, "green check-in = +5");
s.upsertCheckIn(date, { color: "orange", quality: 1 });
assert(
  useStore.getState().checkIns.filter((c) => c.date === date && !c.deletedAt).length === 1,
  "upsert keeps a single active check-in per date",
);
assert(checkInForDate(useStore.getState(), date)?.points === -2, "re-check-in updated to -2");

// History assembly for trends
const hist = exerciseHistory(activeWorkouts(useStore.getState()), pullups.id);
assert(hist.length === 2 && hist[0].metrics.reps === 5, "exercise history picks up logged metrics");
assert(hist[1].status === "none" && hist[1].prescription?.reps === 5, "history includes the planned day with its target");
assert(
  metricOptions("reps_in_time").some((o) => o.key === "reps"),
  "reps_in_time exposes a reps metric option",
);
assert(
  metricOptions("hold").some((o) => o.key === "durationSec"),
  "hold exposes a seconds metric option",
);

// Soft delete = tombstone, not removal
s.deleteExercise(maxhang.id);
{
  const st = useStore.getState();
  assert(st.exercises.length === 2, "deleted exercise still stored (tombstone)");
  assert(
    st.exercises.find((e) => e.id === maxhang.id)?.deletedAt != null,
    "deletedAt set on soft delete",
  );
}

// Persistence: a fresh hydrate from localStorage reproduces state
await useStore.getState().hydrate();
{
  const st = useStore.getState();
  assert(st.exercises.length === 2, "hydrate restored exercises from localStorage");
  assert(activeWorkouts(st).length === 2, "hydrate restored both workouts");
  assert(checkInForDate(st, date)?.points === -2, "hydrate restored check-in points");
}

// Settings stamping: only real changes to account-synced fields count as edits
s.setSettings({ anthropicApiKey: "sk-ant-x" });
const stamped = useStore.getState().settings.settingsUpdatedAt;
assert(typeof stamped === "number" && stamped > 0, "changing a key stamps settingsUpdatedAt");
s.setSettings({ anthropicApiKey: "sk-ant-x", provider: useStore.getState().settings.provider });
assert(
  useStore.getState().settings.settingsUpdatedAt === stamped,
  "re-saving the same values (e.g. blurring the field) does not re-stamp",
);

// Export/import round-trip
const snap = useStore.getState().exportSnapshot();
assert(snap.workouts.length >= 1 && snap.checkIns.length >= 1, "snapshot contains data");

console.log(failures === 0 ? "\nALL PASSED ✅" : `\n${failures} FAILURES ❌`);
if (failures) process.exit(1);
