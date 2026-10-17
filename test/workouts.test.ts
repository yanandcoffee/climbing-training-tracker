// Workout-model tests: importing a coach's note as a sectioned workout,
// copying/appending, and exercise progression across workouts.
import { sanitizePlan } from "../src/lib/parseNotes";
import { defaultMapping, itemKey, NEW_EXERCISE, planToBody } from "../src/lib/importPlan";
import {
  freshCopy,
  groupItems,
  itemFromExercise,
  lastUseOf,
  defaultMergeMode,
  combineSections,
  deleteSection,
  keepTargetOf,
  moveSectionTo,
  hasProgress,
  matchExisting,
  mergeBody,
  moveItemTo,
  nextSectionTitle,
  sectionByCategory,
  sectionForCategory,
  prescriptionSummary,
  type WorkoutBody,
} from "../src/lib/workoutPlan";
import { effectiveMetrics, exerciseHistory, hasLogged, loadLabel, metricOptions, setsSummary } from "../src/lib/history";
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
        { name: "Palm down up and down", group: "TFCC warm up", category: "warm_up", measureType: "reps", sets: 2, reps: 10 },
        { name: "Palm up up and down", group: "TFCC warm up", category: "warm_up", measureType: "reps", sets: 2, reps: 10 },
        { name: "Band stretch pulling up", group: "TFCC warm up", category: "warm_up", measureType: "reps", sets: 2, reps: 10 },
        { name: "Band stretch pulling down", group: "TFCC warm up", category: "warm_up", measureType: "reps", sets: 2, reps: 10 },
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
assert(plan.sections[0].items[0].category === "warm_up", "the new Warm up category is accepted from the model");
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

console.log("Adding a note to a day that already has exercises:");
{
  const ex = (id: string, name: string, extra: Partial<WorkoutBody["exercises"][number]> = {}) =>
    ({ id, name, category: "strength_conditioning", measureType: "reps", status: "none", ...extra }) as WorkoutBody["exercises"][number];
  const mine: WorkoutBody = {
    sections: [{ id: "s", title: "Off-the-wall strength & conditioning" }],
    exercises: [
      ex("m1", "Shrugs", { exerciseId: "lib-shrugs", sectionId: "s", status: "complete", prescription: { sets: 2, reps: 8 } }),
      ex("m2", "Pull ups", { exerciseId: "lib-pull", sectionId: "s" }),
      ex("m3", "Dead hang", { sectionId: "s", measureType: "hold" }),
    ],
  };
  const note: WorkoutBody = {
    sections: [
      { id: "c1", title: "Post Climbing" },
      { id: "c2", title: "Pre Climbing", notes: ["Warm up well"] },
    ],
    exercises: [
      ex("n1", "Shrugs", { exerciseId: "lib-shrugs", sectionId: "c1", prescription: { sets: 3, reps: 10 } }),
      ex("n2", "pull ups", { exerciseId: "lib-pull", sectionId: "c1", prescription: { sets: 3, reps: 5 }, notes: "Slow" }),
      ex("n3", "Rows", { exerciseId: "lib-rows", sectionId: "c1" }),
      ex("n4", "Dead Hang", { sectionId: "c2", measureType: "hold", prescription: { holdSec: 10 } }),
      ex("n5", "Shrugs", { exerciseId: "lib-shrugs", sectionId: "c1" }),
    ],
  };
  const m = mergeBody(mine, note, "append");
  const names = m.exercises.map((e) => e.name);
  assert(names.join(",") === "Shrugs,Pull ups,Dead hang,Rows,Shrugs", "exercises already on the day aren't added again (by library link, else name)");
  assert(matchExisting(mine.exercises, note.exercises).size === 3, "matchExisting finds the same three");
  assert(m.exercises[0].status === "complete" && m.exercises[0].prescription?.reps === 8, "a kept exercise keeps its progress and target");
  assert(m.exercises[1].prescription?.reps === 5 && m.exercises[1].notes === "Slow", "…one with no target yet takes the note's target and notes");
  assert(m.exercises[2].prescription?.holdSec === 10, "…matched by name when there's no library link");
  assert(m.sections.map((s) => s.title).join("|") === "Off-the-wall strength & conditioning|Post Climbing|Pre Climbing", "sections with new exercises or cues are added");
  const onlyDupes = mergeBody(mine, { sections: [{ id: "c1", title: "Post Climbing" }], exercises: [note.exercises[0]] }, "append");
  assert(onlyDupes.sections.length === 1 && onlyDupes.exercises.length === 3, "a note section whose exercises are all already here isn't added empty");

  assert(hasProgress(mine.exercises[0]) && !hasProgress(mine.exercises[1]), "marked Done counts as progress");
  assert(hasProgress(ex("x", "X", { metrics: { sets: [{ reps: 5 }] } })) && !hasProgress(ex("y", "Y", { metrics: { sets: [{}] } })), "logged sets count; blank rows don't");
  const day = (exercises: WorkoutBody["exercises"]) => ({ id: "w", date: "2026-10-14", updatedAt: 1, exercises }) as Workout;
  assert(defaultMergeMode([day(mine.exercises)]) === "append", "a day with progress defaults to Add to it");
  assert(defaultMergeMode([day(mine.exercises.slice(1))]) === "replace", "a day with nothing done defaults to Replace");
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

console.log("Per-set logging:");
{
  const shrugs = lib("Shrugs");
  const wo = (metrics: Workout["exercises"][number]["metrics"], status: "complete" | "none" = "complete"): Workout => ({
    id: "w", date: "2026-10-12", updatedAt: 1, sections: [],
    exercises: [{ id: "i", exerciseId: shrugs.id, name: "Shrugs", category: "strength_conditioning", measureType: "reps", prescription: { sets: 3, reps: 10, weight: 20, weightUnit: "lb" }, status, metrics }],
  });
  const point = (metrics: Workout["exercises"][number]["metrics"]) => exerciseHistory([wo(metrics)], shrugs.id)[0];
  const opt = (k: string) => metricOptions("reps").find((o) => o.key === k)!;

  const three = point({ sets: [{ reps: 10, weight: 20 }, { reps: 10, weight: 20 }, { reps: 8, weight: 20 }] });
  assert(opt("reps").value(three.effective) === 10, "chart reps = the best set (10, 10, 8 → 10)");
  assert(opt("volume").value(three.effective) === 560, "volume sums the sets (10+10+8) × 20 = 560");
  assert(three.sets.length === 3, "history keeps all three sets");
  assert(setsSummary(three.sets) === "10 reps @ 20 lb · 10 reps @ 20 lb · 8 reps @ 20 lb", "per-set summary line");

  const drop = point({ sets: [{ reps: 10, weight: 20 }, { reps: 8, weight: 15 }] });
  assert(opt("weight").value(drop.effective) === 20, "chart weight = heaviest set");

  const blank = point({ sets: [{}, { reps: 6 }, {}] });
  assert(blank.sets.length === 1 && opt("reps").value(blank.effective) === 6, "blank rows are ignored");
  assert(opt("weight").value(blank.effective) === 20 && opt("volume").value(blank.effective) === 120, "unlogged weight on a Done item falls back to the target weight");

  const old = point({ reps: 6, weight: 18 });
  assert(old.sets.length === 1 && opt("reps").value(old.effective) === 6 && opt("volume").value(old.effective) === 108, "older single-result logs still read as one set");

  assert(point(undefined).sets.length === 0 && opt("reps").value(point(undefined).effective) === 10, "no log + Done still counts the target");
  assert(!hasLogged({ sets: [{}] }) && hasLogged({ sets: [{ reps: 1 }] }) && hasLogged({ rpe: 7 }) && hasLogged({ reps: 3 }), "hasLogged ignores blank rows");
}

console.log("Sections and drag-and-drop moves:");
{
  const it = (id: string, sectionId?: string, group?: string) =>
    ({ id, sectionId, group, name: id, category: "core", measureType: "reps", status: "none" }) as const;
  const sections = [{ id: "s1", title: "Warm up" }, { id: "s2", title: "Section 2" }];
  const items = [it("a", "s1", "G"), it("b", "s1", "G"), it("c", "s1"), it("d", "s2")];
  const order = (l: { id: string }[]) => l.map((e) => e.id).join("");

  assert(nextSectionTitle([]) === "Section 1" && nextSectionTitle(sections) === "Section 3", "new sections are numbered");
  assert(nextSectionTitle([{ id: "x", title: "Section 2" }]) === "Section 3", "…skipping titles already used");

  const warm = sectionForCategory(sections, "warm_up");
  assert(warm.id === "s1" && warm.sections === sections, "a category's section is found by title (Warm up)");
  const core = sectionForCategory([], "core");
  assert(core.sections.length === 1 && core.sections[0].title === "Core training", "…or created, named after the category");
  const placed = sectionForCategory(
    [{ id: "w", title: "Warm up" }, { id: "m", title: "Mobility work" }, { id: "x", title: "Finger stuff" }],
    "on_wall_drills",
  ).sections.map((s) => s.title);
  assert(placed.join("|") === "Warm up|On-wall climbing drills|Mobility work|Finger stuff", "new category sections sit in category order");
  const flat = sectionByCategory({
    sections: [],
    exercises: [
      { ...it("p"), category: "warm_up" },
      { ...it("q"), category: "strength_conditioning" },
      { ...it("r"), category: "warm_up" },
    ],
  });
  assert(
    flat.sections.map((s) => s.title).join("|") === "Warm up|Off-the-wall strength & conditioning" &&
      flat.exercises[0].sectionId === flat.exercises[2].sectionId,
    "a plain list is organized into category sections",
  );

  const up = moveItemTo(items, sections, "c", "s1", 0);
  assert(order(up) === "cabd" && up[0].group === undefined, "moving to the top of a section, outside the group, keeps it ungrouped");
  const into = moveItemTo(items, sections, "c", "s1", 1);
  assert(order(into) === "acbd" && into[1].group === "G", "dropping inside a group's run joins that group");
  const across = moveItemTo(items, sections, "a", "s2", 1);
  assert(order(across) === "bcda" && across[3].sectionId === "s2" && across[3].group === "G", "dragging to another section moves it there");
  const toEmpty = moveItemTo(items, [...sections, { id: "s3", title: "Cool down" }], "d", "s3", 0);
  assert(toEmpty.find((e) => e.id === "d")?.sectionId === "s3", "an empty section accepts a drop");
  const out = moveItemTo(items, sections, "d", "", 0);
  assert(out.find((e) => e.id === "d")?.sectionId === undefined, "the no-section list accepts a drop");
  const preview = moveItemTo(items, sections, "c", "s1", 1, { regroup: false });
  assert(preview[1].group === undefined, "drag previews don't regroup until the drop");
}

console.log("Moving and deleting sections:");
{
  const ex = (id: string, sectionId?: string) =>
    ({ id, name: id, sectionId, category: "core", measureType: "reps", status: "none" }) as WorkoutBody["exercises"][number];
  const body: WorkoutBody = {
    sections: [
      { id: "A", title: "Warm up", notes: ["Easy"] },
      { id: "B", title: "Post climbing", notes: ["Slow", "Easy"] },
      { id: "C", title: "Cool down" },
    ],
    exercises: [ex("a1", "A"), ex("b1", "B"), ex("a2", "A"), ex("b2", "B"), ex("c1", "C")],
  };
  const ids = (l: { id: string }[]) => l.map((x) => x.id).join("");
  assert(ids(moveSectionTo(body.sections, "C", 0)) === "CAB", "a section moves to a new position");
  assert(ids(moveSectionTo(body.sections, "A", 1)) === "BAC", "…one step down");
  assert(ids(moveSectionTo(body.sections, "A", 9)) === "BCA", "…clamped to the end");
  assert(keepTargetOf(body.sections, "B")?.id === "A" && keepTargetOf(body.sections, "A")?.id === "B", "kept exercises go to the section above, else below");

  const gone = deleteSection(body, "B", false);
  assert(ids(gone.sections) === "AC" && ids(gone.exercises) === "a1a2c1", "deleting with its exercises removes both");
  const kept = deleteSection(body, "B", true);
  assert(ids(kept.sections) === "AC", "deleting but keeping removes only the section");
  assert(ids(kept.exercises.filter((e) => e.sectionId === "A")) === "a1a2b1b2", "…its exercises join the end of the section above");
  assert(kept.sections[0].notes?.join("|") === "Easy|Slow", "…bringing its cues along");
  const first = deleteSection(body, "A", true);
  assert(ids(first.exercises.filter((e) => e.sectionId === "B")) === "b1b2a1a2", "deleting the first section moves its exercises to the next one");
  const comb = combineSections(body, "A", "C");
  assert(ids(comb.sections) === "BC" && comb.sections[1].title === "Cool down", "combining removes the first section; the target keeps its name and place");
  assert(ids(comb.exercises.filter((e) => e.sectionId === "C")) === "c1a1a2", "…its exercises go to the end of the target, in order");
  assert(comb.sections[1].notes?.join("|") === "Easy", "…and its cues come along");
  assert(combineSections(body, "A", "A") === body && combineSections(body, "A", "zzz") === body, "combining with itself or a missing section does nothing");
  const only = deleteSection({ sections: [body.sections[0]], exercises: [ex("a1", "A")] }, "A", true);
  assert(only.sections.length === 0 && only.exercises[0].sectionId === undefined, "the only section's exercises are left without a section");
}

console.log("\nOn/off intervals and signed loads");
{
  const parsed = sanitizePlan({
    workoutName: "Hangboard",
    sections: [
      {
        title: "Fingers",
        notes: [],
        items: [
          { name: "Repeaters", category: "strength_conditioning", measureType: "intervals", sets: 5, holdSec: 7, restSec: 3, weight: 0, weightUnit: "lb" },
          { name: "Pulley hang", category: "strength_conditioning", measureType: "intervals", sets: 3, reps: 6, holdSec: 7, restSec: 3, weight: -15, weightUnit: "lb" },
          { name: "Weighted hang", category: "strength_conditioning", measureType: "hold", sets: 3, holdSec: 10, weight: 10, weightUnit: "kg" },
        ],
      },
    ],
  });
  const [rep, pulley, weighted] = parsed.sections[0].items;
  assert(rep.measureType === "intervals" && rep.holdSec === 7 && rep.restSec === 3, "the parser keeps on/off intervals and their off time");
  assert(rep.weight === 0 && pulley.weight === -15, "…and bodyweight (0) and assisted (negative) loads");
  assert(prescriptionSummary("intervals", rep) === "5 × 7s on / 3s off @ bodyweight", "intervals summarized: 5 × 7s on / 3s off @ bodyweight");
  assert(
    prescriptionSummary("intervals", pulley) === "3 sets × 6 reps · 7s on / 3s off @ −15 lb assisted",
    "repeaters with reps per set and an assisted load summarized",
  );
  assert(prescriptionSummary("hold", weighted) === "3 × 10s hold @ 10 kg", "added weight reads as before");
  assert(loadLabel(0) === "bodyweight" && loadLabel(-2.5, "kg") === "−2.5 kg assisted" && loadLabel(5) === "5 lb", "load labels");

  const b = planToBody(parsed, {
    mapping: defaultMapping(parsed, []),
    removed: new Set(),
    library: [],
    createExercise: (d) => lib(d.name, d),
  });
  assert(b.exercises[0].prescription?.restSec === 3 && b.exercises[1].prescription?.weight === -15, "off time and assisted load carried onto the workout");

  const done = effectiveMetrics("complete", "intervals", rep, {});
  assert(done.durationSec === 7 && done.weight === 0, "an interval marked done counts the on time and load");
  const doneReps = effectiveMetrics("complete", "intervals", pulley, {});
  assert(doneReps.reps === 6 && doneReps.weight === -15, "…and reps per set for repeaters");

  const opts = metricOptions("intervals");
  assert(opts.map((o) => o.key).join(",") === "durationSec,reps,weight,rpe", "interval charts: seconds on, reps per set, load, RPE");
  const loadOpt = opts.find((o) => o.key === "weight")!;
  assert(loadOpt.label === "Load" && loadOpt.format?.(-15) === "−15 lb assisted", "load chart labels assisted values");
  const best = effectiveMetrics("none", "intervals", undefined, { sets: [{ weight: -20 }, { weight: -10 }] });
  assert(best.weight === -10, "best set is the one with the least assistance");
  const volume = metricOptions("reps").find((o) => o.key === "volume")!;
  assert(
    volume.value({ sets: [{ reps: 5, weight: 10 }, { reps: 5, weight: 0 }, { reps: 5, weight: -15 }] }) === 50,
    "volume counts added weight only",
  );
  assert(
    setsSummary([{ reps: 5, weight: 0 }, { durationSec: 7, weight: -15 }]) === "5 reps @ bodyweight · 7s @ −15 lb assisted",
    "logged sets show bodyweight and assisted loads",
  );
}

console.log(failures === 0 ? "\nWORKOUTS OK ✅" : `\n${failures} FAILURES ❌`);
if (failures) process.exit(1);
