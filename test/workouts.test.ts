// Workout-model tests: importing a coach's note as a sectioned workout,
// copying/appending, and exercise progression across workouts.
import { sanitizePlan } from "../src/lib/parseNotes";
import { defaultMapping, itemKey, NEW_EXERCISE, planToBody } from "../src/lib/importPlan";
import {
  freshCopy,
  groupItems,
  itemFromExercise,
  lastUseOf,
  mergeBody,
  prescriptionSummary,
  type WorkoutBody,
} from "../src/lib/workoutPlan";
import { exerciseHistory, metricOptions } from "../src/lib/history";
import type { Exercise, Workout } from "../src/types";

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

let n = 0;
const lib = (name: string, extra: Partial<Exercise> = {}): Exercise => ({
  id: `ex${++n}`,
  name,
  category: "strength_conditioning",
  measureType: "reps",
  updatedAt: 1,
  ...extra,
});

// What a model returns for the coach's note (the shape the prompt asks for).
// Includes some sloppiness to exercise sanitizePlan.
const modelOutput = {
  workoutName: "Shoulder & finger session",
  sections: [
    {
      title: "Pre Climbing",
      notes: [],
      items: [
        { name: "Palm down up and down", group: "TFCC warm up", category: "mobility", measureType: "reps", sets: 2, reps: 10 },
        { name: "Palm up up and down", group: "TFCC warm up", category: "mobility", measureType: "reps", sets: 2, reps: 10 },
        { name: "Band stretch pulling up", group: "TFCC warm up", category: "mobility", measureType: "reps", sets: 2, reps: 10 },
        { name: "Band stretch pulling down", group: "TFCC warm up", category: "mobility", measureType: "reps", sets: 2, reps: 10 },
        { name: "Three finger full extension", group: "Ground finger warm up (on 10mm)", category: "strength_conditioning", measureType: "hold", sets: 3, holdSec: 10, weight: 11.25, weightUnit: "lb" },
        { name: "Four finger half crimp", group: "Ground finger warm up (on 10mm)", category: "strength_conditioning", measureType: "hold", sets: 3, holdSec: 10, weight: 10, weightUnit: "lb" },
        { name: "Four finger curls", group: "Ground finger warm up (on 10mm)", category: "strength_conditioning", measureType: "hold", sets: 3, holdSec: 10, weight: 7.5 },
      ],
    },
    {
      title: "Climbing",
      notes: [],
      items: [
        { name: "Lat stretch climbing", group: "Warm up", category: "on_wall_drills", measureType: "check" },
        { name: "Lock off push with trap", group: "Warm up", category: "on_wall_drills", measureType: "check" },
        { name: "Side to side", group: "Warm up", category: "on_wall_drills", measureType: "bogus" },
      ],
    },
    {
      title: "Climbing Focus",
      notes: [
        "Focus on Rhythm",
        "Bending elbow a little to compensate for shoulder power until shoulder power increases",
        "Stopping by match to go to a next move to help with shoulder power lacking as well",
      ],
      items: [],
    },
    {
      title: "Post Climbing exercise",
      notes: [],
      items: [
        { name: "Shoulder Bender / Bicep curl", category: "strength_conditioning", measureType: "reps", sets: 2, reps: 10 },
        { name: "Shoulder Shrug", category: "strength_conditioning", measureType: "reps", sets: 1, reps: 7 },
        { name: "Pull ups", category: "strength_conditioning", measureType: "reps", sets: 2, reps: 7 },
        { name: "", category: "core", measureType: "reps" }, // junk: dropped
      ],
    },
    { title: "Empty", notes: [], items: [] }, // junk: dropped
  ],
};

console.log("Parse → plan:");
const plan = sanitizePlan(modelOutput);
assert(plan.sections.map((s) => s.title).join(" | ") === "Pre Climbing | Climbing | Climbing Focus | Post Climbing exercise", "sections kept in the coach's order; empty ones dropped");
assert(plan.sections[2].items.length === 0 && plan.sections[2].notes.length === 3, "focus cues kept as notes, not exercises");
assert(plan.sections[1].items[2].measureType === "check", "unknown measure type falls back to 'just do it'");
assert(plan.sections[0].items[6].weightUnit === "lb", "a weight without a unit defaults to lb");
assert(plan.sections[3].items.length === 3, "nameless junk items dropped");
assert(prescriptionSummary("hold", plan.sections[0].items[4]) === "3 × 10s hold @ 11.25 lb", "hold with load summarized");
assert(prescriptionSummary("reps", plan.sections[3].items[1]) === "1 × 7", "sets × reps summarized");
assert(prescriptionSummary("check", {}) === "", "no-target item has an empty summary");

console.log("Plan → workout (reusing your library):");
const existingPullUps = lib("Pull Ups"); // different capitalisation
const existingShrug = lib("Shoulder shrug");
const library = [existingPullUps, existingShrug];
const mapping = defaultMapping(plan, library);
assert(mapping[itemKey(3, 2)] === existingPullUps.id, "existing exercise matched by name (case-insensitive)");
assert(mapping[itemKey(3, 1)] === existingShrug.id, "'Shoulder Shrug' matched to existing 'Shoulder shrug'");
assert(mapping[itemKey(0, 0)] === NEW_EXERCISE, "unknown exercise defaults to new");

const created: Exercise[] = [];
const removed = new Set([itemKey(1, 2)]); // user taps "Skip" on "Side to side"
const body = planToBody(plan, {
  name: "Week 1",
  mapping,
  removed,
  library,
  createExercise: (d) => {
    const ex = lib(d.name, d);
    created.push(ex);
    return ex;
  },
});
assert(body.name === "Week 1", "edited workout name used");
assert(body.sections.length === 4, "all four sections imported");
assert(body.exercises.length === 12, "12 exercises (13 minus the skipped one)");
assert(created.length === 10, "only the 10 new exercises were added to the library");
const shrugItem = body.exercises.find((e) => e.exerciseId === existingShrug.id)!;
assert(shrugItem.name === "Shoulder shrug" && shrugItem.prescription?.reps === 7, "matched item uses the library name + this note's reps");
const finger = body.exercises.find((e) => e.name === "Three finger full extension")!;
assert(finger.group === "Ground finger warm up (on 10mm)" && finger.prescription?.weight === 11.25, "group + load carried onto the workout item");
const focus = body.sections.find((s) => s.title === "Climbing Focus")!;
assert(focus.notes?.length === 3 && !body.exercises.some((e) => e.sectionId === focus.id), "focus section holds cues only");
assert(
  body.exercises.every((e) => body.sections.some((s) => s.id === e.sectionId)),
  "every item belongs to an imported section",
);
const pre = body.exercises.filter((e) => e.sectionId === body.sections[0].id);
const groups = groupItems(pre);
assert(groups.length === 2 && groups[0].items.length === 4 && groups[1].items.length === 3, "Pre Climbing renders as 2 groups (TFCC 4, finger 3)");

{
  const dupPlan = sanitizePlan({
    workoutName: "x",
    sections: [
      { title: "A", notes: [], items: [{ name: "Dead hang", category: "strength_conditioning", measureType: "hold" }] },
      { title: "B", notes: [], items: [{ name: "dead hang", category: "strength_conditioning", measureType: "hold" }] },
    ],
  });
  const made: Exercise[] = [];
  const b2 = planToBody(dupPlan, {
    mapping: defaultMapping(dupPlan, []),
    library: [],
    createExercise: (d) => {
      const ex = lib(d.name, d);
      made.push(ex);
      return ex;
    },
  });
  assert(made.length === 1 && b2.exercises[0].exerciseId === b2.exercises[1].exerciseId, "the same new exercise twice in one note creates it once");
}

console.log("Copy / append:");
{
  const done = {
    ...body,
    exercises: body.exercises.map((e) => ({ ...e, status: "complete" as const, metrics: { rpe: 7 } })),
  };
  const copy = freshCopy(done);
  assert(copy.exercises.every((e) => e.status === "none" && !e.metrics), "copy resets checkmarks and logged numbers");
  assert(copy.exercises.every((e, i) => e.prescription?.reps === done.exercises[i].prescription?.reps), "copy keeps sets/reps");
  assert(copy.sections.every((s, i) => s.id !== done.sections[i].id), "copy gets new section ids");
  assert(copy.exercises.every((e) => copy.sections.some((s) => s.id === e.sectionId)), "copy's items re-linked to the new sections");

  const existing: WorkoutBody = {
    sections: [{ id: "x1", title: "post climbing EXERCISE", notes: ["Go easy"] }],
    exercises: [{ id: "i1", sectionId: "x1", name: "Plank", category: "core", measureType: "hold", status: "complete" }],
  };
  const merged = mergeBody(existing, body, "append");
  const post = merged.sections.filter((s) => s.title.toLowerCase() === "post climbing exercise");
  assert(post.length === 1, "append merges sections with the same title (case-insensitive)");
  assert(merged.exercises.filter((e) => e.sectionId === "x1").length === 4, "existing + imported Post Climbing items together");
  assert(merged.exercises[0].status === "complete", "append keeps existing progress");
  assert(post[0].notes?.[0] === "Go easy", "existing section cues kept");
  assert(mergeBody(existing, body, "replace").exercises.length === 12, "replace discards the existing content");
}

console.log("Progression (Shrugs 1×5 → 1×7):");
{
  const shrugs = lib("Shrugs");
  const mk = (date: string, reps: number, status: "complete" | "none"): Workout => ({
    id: `wo-${date}`,
    date,
    updatedAt: 1,
    sections: [],
    exercises: [
      { id: `i-${date}`, exerciseId: shrugs.id, name: "Shrugs", category: "strength_conditioning", measureType: "reps", prescription: { sets: 1, reps }, status },
    ],
  });
  const week1 = mk("2026-10-01", 5, "complete");
  const item = itemFromExercise(shrugs, [week1], "2026-10-08");
  assert(item.prescription?.sets === 1 && item.prescription?.reps === 5, "adding Shrugs next week pre-fills last week's 1 × 5");
  item.prescription = { ...item.prescription, reps: 7 }; // coach: now 7
  assert(week1.exercises[0].prescription?.reps === 5, "editing this week's reps doesn't touch last week");
  const week2: Workout = { ...mk("2026-10-08", 7, "complete"), exercises: [{ ...item, status: "complete" }] };
  assert(lastUseOf([week1, week2], shrugs.id, "2026-10-08")?.prescription?.reps === 7, "last use now reports 7");
  const hist = exerciseHistory([week2, week1], shrugs.id);
  const reps = metricOptions("reps").find((o) => o.key === "reps")!;
  assert(hist.map((p) => reps.value(p.effective)).join(",") === "5,7", "chart shows 5 → 7 from just tapping Done (no logging)");
  const partial = exerciseHistory([{ ...week2, exercises: [{ ...item, status: "partial" }] }], shrugs.id)[0];
  assert(reps.value(partial.effective) === undefined, "a partial set isn't counted as the full target");
  const logged = exerciseHistory([{ ...week2, exercises: [{ ...item, status: "complete", metrics: { reps: 6 } }] }], shrugs.id)[0];
  assert(reps.value(logged.effective) === 6, "logged numbers win over the target");
  const ahead = itemFromExercise(shrugs, [week1, week2], "2026-09-01");
  assert(ahead.prescription?.reps === 7, "planning an earlier/unknown date falls back to the latest use");
}

console.log(failures === 0 ? "\nWORKOUTS OK ✅" : `\n${failures} FAILURES ❌`);
if (failures) process.exit(1);
