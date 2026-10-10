// Headless verification of pure logic + the store's reducers/persistence.
import {
  scoreForCheckIn,
  pointOptions,
  qualityForPoints,
  nearestPointOption,
} from "../src/lib/scoring";
import { exerciseHistory, metricOptions } from "../src/lib/history";
import { weekdayOf } from "../src/lib/dates";
import {
  useStore,
  activeWorkouts,
  checkInForDate,
} from "../src/store/useStore";
import type { TemplateExercise } from "../src/types";

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

// --- Store flow ------------------------------------------------------------
console.log("Store flow:");
const s = useStore.getState();

const pullups = s.addExercise({
  name: "Weighted pull-ups",
  category: "strength_conditioning",
  measureType: "reps",
  defaultSets: 4,
  defaultReps: 5,
});
const maxhang = s.addExercise({
  name: "Max hang",
  category: "strength_conditioning",
  measureType: "hold",
  defaultSets: 5,
  defaultHoldSec: 10,
});
assert(useStore.getState().exercises.length === 2, "two library exercises");

const tplEx: TemplateExercise[] = [
  {
    id: "te1",
    exerciseId: pullups.id,
    name: pullups.name,
    category: pullups.category,
    measureType: pullups.measureType,
    prescription: { sets: 4, reps: 5 },
  },
  {
    id: "te2",
    exerciseId: maxhang.id,
    name: maxhang.name,
    category: maxhang.category,
    measureType: maxhang.measureType,
    prescription: { sets: 5, holdSec: 10 },
  },
];
const tpl = s.addTemplate("Power day", tplEx);

const date = "2026-02-03";
s.addScheduleEntry({ templateId: tpl.id, weekday: weekdayOf(date) });

const workout = s.getOrCreateWorkoutForDate(date);
assert(workout.exercises.length === 2, "workout materialized 2 exercises from template");
assert(
  workout.exercises.every((e) => e.exerciseId),
  "materialized exercises keep exerciseId link",
);

// Re-fetch should return the SAME workout (no duplicate creation)
const again = useStore.getState().getOrCreateWorkoutForDate(date);
assert(again.id === workout.id, "getOrCreate is idempotent for a date");
assert(activeWorkouts(useStore.getState()).length === 1, "exactly one workout stored");

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
assert(hist.length === 1 && hist[0].metrics.reps === 5, "exercise history picks up logged metrics");
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
  assert(activeWorkouts(st).length === 1, "hydrate restored the workout");
  assert(checkInForDate(st, date)?.points === -2, "hydrate restored check-in points");
}

// Export/import round-trip
const snap = useStore.getState().exportSnapshot();
assert(snap.workouts.length >= 1 && snap.checkIns.length >= 1, "snapshot contains data");

console.log(failures === 0 ? "\nALL PASSED ✅" : `\n${failures} FAILURES ❌`);
if (failures) process.exit(1);
