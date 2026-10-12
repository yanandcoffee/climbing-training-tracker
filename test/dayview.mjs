// Drives the real WorkoutDayView in jsdom: plan a day by copying a previous
// workout, adjust a prescription inline, and add an exercise that pre-fills
// from last time.
import { JSDOM } from "jsdom";
import { createJiti } from "jiti";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const g = globalThis;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.localStorage = dom.window.localStorage;
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const jiti = createJiti(import.meta.url, { jsx: true, moduleCache: true });
const React = (await jiti.import("react")).default;
g.React = React;
const { act } = await jiti.import("react");
const { createRoot } = await jiti.import("react-dom/client");
const { MemoryRouter } = await jiti.import("react-router-dom");
const WorkoutDayView = (await jiti.import("../src/components/WorkoutDayView")).default;
const { useStore, activeWorkouts } = await jiti.import("../src/store/useStore");

let failures = 0;
const assert = (cond, msg) => {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

// ---- seed: last week's session with Shrugs 1 × 5 (done) --------------------
const st = useStore.getState();
const shrugs = st.addExercise({ name: "Shrugs", category: "strength_conditioning", measureType: "reps" });
const pullups = st.addExercise({ name: "Pull ups", category: "strength_conditioning", measureType: "reps" });
const LAST = "2026-10-05";
const DAY = "2026-10-12";
st.applyWorkoutToDates(
  {
    name: "Shoulder session",
    sections: [{ id: "post", title: "Post Climbing exercise" }],
    exercises: [
      { id: "a", exerciseId: shrugs.id, sectionId: "post", name: "Shrugs", category: "strength_conditioning", measureType: "reps", prescription: { sets: 1, reps: 5 }, status: "none" },
    ],
  },
  [LAST],
  "replace",
);
{
  const w = activeWorkouts(useStore.getState()).find((x) => x.date === LAST);
  st.saveWorkout({ ...w, exercises: w.exercises.map((e) => ({ ...e, status: "complete" })) });
}

const host = document.createElement("div");
document.body.appendChild(host);
const root = createRoot(host);
await act(async () =>
  root.render(React.createElement(MemoryRouter, null, React.createElement(WorkoutDayView, { date: DAY }))),
);

const click = (el) => act(async () => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
const buttons = () => [...document.querySelectorAll("button")];
const btn = (re) => buttons().find((b) => re.test(b.textContent));
const dayWorkout = () => activeWorkouts(useStore.getState()).find((w) => w.date === DAY);
const lastWorkout = () => activeWorkouts(useStore.getState()).find((w) => w.date === LAST);
const blurWith = (input, value) =>
  act(async () => {
    input.value = value;
    input.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });

console.log("Planning a day:");
assert(/Nothing planned/.test(host.textContent), "empty day says nothing is planned");
assert(!!btn(/Import coach's note/) && !!btn(/Copy a previous workout/) && !!btn(/Build it exercise by exercise/), "offers import, copy, and build");

await click(btn(/Copy a previous workout/));
const source = btn(/Shoulder session/);
assert(!!source, "copy dialog lists last week's workout");
await click(source);
assert(dayWorkout().exercises.length === 1, "copying fills the day");
assert(dayWorkout().exercises[0].status === "none", "…with fresh progress");
assert(/Post Climbing exercise/.test(host.textContent) && /1 × 5/.test(host.textContent), "shows the section and last week's 1 × 5");

console.log("Progressing a prescription inline:");
await click(btn(/^Shrugs/));
const targetBlock = [...host.querySelectorAll("p")].find((p) => p.textContent === "Target for this workout")?.parentElement;
const repsInput = [...(targetBlock?.querySelectorAll("label") ?? [])].find((l) => /^Reps/.test(l.textContent))?.querySelector("input");
assert(!!repsInput, "tapping the exercise opens its target editor");
assert(/Last time \(5 Oct\): 1 × 5/.test(host.textContent), "editor shows what was done last time");
await blurWith(repsInput, "7");
assert(dayWorkout().exercises[0].prescription.reps === 7, "this workout's Shrugs are now 1 × 7");
assert(lastWorkout().exercises[0].prescription.reps === 5, "last week's record still says 1 × 5");
assert(/1 × 7/.test(host.textContent), "row summary updates to 1 × 7");

console.log("Logging sets:");
{
  const didBlock = () => [...host.querySelectorAll("p")].find((p) => /^What you did/.test(p.textContent))?.parentElement;
  const setInputs = (label) =>
    [...(didBlock()?.querySelectorAll("label") ?? [])].filter((l) => l.textContent.startsWith(label)).map((l) => l.querySelector("input"));
  assert(setInputs("Reps").length === 1 && /Set 1/.test(didBlock().textContent), "shows one blank set row to start");
  assert(!!btn(/Fill 1 from target/), "offers to fill the sets from the target");
  await blurWith(setInputs("Reps")[0], "7");
  assert(dayWorkout().exercises[0].metrics.sets.length === 1 && dayWorkout().exercises[0].metrics.sets[0].reps === 7, "typing logs set 1");
  await click(btn(/＋ Add set/));
  assert(setInputs("Reps").length === 2, "＋ Add set adds a second row");
  assert(dayWorkout().exercises[0].metrics.sets[1].reps === 7, "…pre-filled from the previous set");
  await blurWith(setInputs("Reps")[1], "5");
  assert(dayWorkout().exercises[0].metrics.sets.map((s) => s.reps).join(",") === "7,5", "second set edited to 5 (7, 5 logged)");
  await click(btn(/＋ Add set/));
  await click(didBlock().querySelectorAll('button[aria-label="Remove set 3"]')[0]);
  assert(dayWorkout().exercises[0].metrics.sets.length === 2, "✕ removes a set");
  await click(didBlock().querySelectorAll('button[aria-label="Remove set 2"]')[0]);
  await click(didBlock().querySelectorAll('button[aria-label="Remove set 1"]')[0]);
  assert(!dayWorkout().exercises[0].metrics.sets, "removing every set clears the log");
  await blurWith(setInputs("Reps")[0], "7");
  await click(btn(/＋ Add set/));
  await blurWith(setInputs("Reps")[1], "5");
}

console.log("Adding an exercise:");
await click(btn(/＋ Exercise/));
assert(/Not done yet/.test(host.textContent), "library shows exercises never done");
assert(/Last 5 Oct: 1 × 5/.test(host.textContent), "…and last time's target for ones that were");
await click(buttons().find((b) => b.textContent.startsWith("Pull ups")));
assert(dayWorkout().exercises.length === 2, "exercise added to the workout");
assert(dayWorkout().exercises[1].sectionId === dayWorkout().sections[0].id, "added to the chosen section");

console.log("Tracking:");
await click(buttons().filter((b) => /Done$/.test(b.textContent.trim()) && b.getAttribute("aria-pressed") !== null)[0]);
assert(dayWorkout().exercises[0].status === "complete", "tapping Done marks it complete");
assert(/1\/2 done/.test(host.textContent), "header shows 1/2 done");

await act(async () => root.unmount());
console.log(failures === 0 ? "\nDAY VIEW OK ✅" : `\n${failures} FAILURES ❌`);
process.exit(failures ? 1 : 0);
