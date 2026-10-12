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
assert(/goes to the section for its category/.test(host.textContent), "the main ＋ Exercise sorts by category");
await click(btn(/^Done$/));
await click(btn(/^＋ Add$/)); // the section's own add button
assert(/Adding to Post Climbing exercise/.test(host.textContent.replace(/\s+/g, " ")), "a section's ＋ Add targets that section");
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

console.log("Building an empty day with a new section:");
{
  const DAY2 = "2026-10-14";
  const host2 = document.createElement("div");
  document.body.appendChild(host2);
  const root2 = createRoot(host2);
  await act(async () =>
    root2.render(React.createElement(MemoryRouter, null, React.createElement(WorkoutDayView, { date: DAY2 }))),
  );
  const b2 = (re) => [...host2.querySelectorAll("button")].find((b) => re.test(b.textContent));
  const day2 = () => activeWorkouts(useStore.getState()).find((w) => w.date === DAY2);
  const setVal = (el, v) =>
    act(async () => {
      const proto = el.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new dom.window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  const byPlaceholder = (p) => host2.querySelector(`input[placeholder^="${p}"]`);
  const sectionSelect = () =>
    [...host2.querySelectorAll("label")].find((l) => l.textContent.startsWith("Section of this workout"))?.querySelector("select");
  const createInSection = async (exName, sectionValue, newTitle) => {
    await click(b2(/^New exercise$/));
    await setVal(byPlaceholder("Exercise name"), exName);
    await setVal(sectionSelect(), sectionValue);
    if (newTitle != null) await setVal(byPlaceholder("Section name"), newTitle);
    await click(b2(/Create and add/));
  };

  await click(b2(/Build it exercise by exercise/));
  assert(/section for its category/.test(host2.textContent) && !sectionSelect(), "panel says where exercises go; no Section dropdown outside New exercise");
  await click(b2(/^New exercise$/));
  assert(!!sectionSelect(), "Section dropdown is inside the New exercise form");
  assert(sectionSelect().options[0].textContent.startsWith("By category"), "…defaulting to the exercise's category");
  await click(b2(/^From library$/));

  await createInSection("Palm down up and down", "__new__", "Warm up");
  assert(day2().sections.length === 1 && day2().sections[0].title === "Warm up", "creating with a new section makes it");
  assert(/Added: Palm down up and down/.test(host2.textContent), "panel stays open (state kept) after the empty day becomes a workout");
  assert(/Adding to Warm up/.test(host2.textContent.replace(/\s+/g, " ")), "…and now adds to the new section");

  await createInSection("Palm up up and down", "__new__", "warm up");
  assert(day2().sections.length === 1, "typing the same section name again reuses it (no duplicate)");
  assert(day2().exercises.every((e) => e.sectionId === day2().sections[0].id), "both exercises are in Warm up");

  await click([...host2.querySelectorAll("button")].find((b) => b.textContent.startsWith("Shrugs")));
  assert(day2().exercises[2].sectionId === day2().sections[0].id, "after picking a section on purpose, library adds go there too");

  // "Added" follows the workout: removing an item drops it from the list.
  const addedLine = () => [...host2.querySelectorAll("p")].find((p) => p.textContent.startsWith("Added:"))?.textContent;
  await click([...host2.querySelectorAll("button")].find((b) => b.textContent.startsWith("Shrugs")));
  assert(addedLine() === "Added: Palm down up and down, Palm up up and down, Shrugs, Shrugs", "adding Shrugs twice lists it twice");
  const dupId = day2().exercises[3].id;
  await act(async () => st.saveWorkout({ ...day2(), exercises: day2().exercises.filter((e) => e.id !== dupId) }));
  assert(addedLine() === "Added: Palm down up and down, Palm up up and down, Shrugs", "removing one from the workout updates the Added list");
  assert([...host2.querySelectorAll("p")].some((p) => p.textContent.startsWith("Sets/reps are pre-filled")), "the tip is on its own line");

  // Repair: a workout that already has two "Warm up" sections gets merged.
  const w = day2();
  st.saveWorkout({
    ...w,
    sections: [...w.sections, { id: "dup", title: "Warm Up", notes: ["Slow"] }],
    exercises: [...w.exercises, { ...w.exercises[0], id: "x", sectionId: "dup" }],
  });
  await act(async () => {});
  assert(day2().sections.length === 1 && day2().exercises.every((e) => e.sectionId === day2().sections[0].id), "existing duplicate sections are merged on open");
  assert(day2().sections[0].notes?.[0] === "Slow", "…keeping their cues");
  await act(async () => root2.unmount());
}

console.log("Exercises go to their category's section:");
{
  const DAY3 = "2026-10-16";
  const host3 = document.createElement("div");
  document.body.appendChild(host3);
  const root3 = createRoot(host3);
  await act(async () =>
    root3.render(React.createElement(MemoryRouter, null, React.createElement(WorkoutDayView, { date: DAY3 }))),
  );
  const b3 = (re) => [...host3.querySelectorAll("button")].find((b) => re.test(b.textContent));
  const day3 = () => activeWorkouts(useStore.getState()).find((w) => w.date === DAY3);
  const text3 = () => host3.textContent.replace(/\s+/g, " ");

  const warmup = st.addExercise({ name: "Wrist circles", category: "warm_up", measureType: "check" });
  await click(b3(/Build it exercise by exercise/));
  await click(b3(/^Shrugs/));
  const S_AND_C = "Off-the-wall strength & conditioning";
  assert(day3().sections.length === 1 && day3().sections[0].title === S_AND_C, "the first add makes a section named after its category");
  await click(b3(/^Pull ups/));
  assert(day3().sections.length === 1 && day3().exercises.every((e) => e.sectionId === day3().sections[0].id), "same category → same section");
  await click(b3(/^Wrist circles/));
  assert(day3().sections.map((s) => s.title).join("|") === `Warm up|${S_AND_C}`, "a warm-up exercise gets a Warm up section, placed first");
  assert(day3().exercises.find((e) => e.exerciseId === warmup.id).sectionId === day3().sections[0].id, "…and goes into it");
  await click(b3(/^Done$/));

  // A section's own ＋ Add puts any exercise there; "Sort by category instead" undoes that.
  await click([...host3.querySelectorAll("button")].filter((b) => /^＋ Add$/.test(b.textContent))[0]);
  assert(/Adding to Warm up/.test(text3()), "a section's ＋ Add targets that section");
  await click(b3(/^Pull ups/));
  assert(day3().exercises.at(-1).sectionId === day3().sections[0].id, "…even for another category");
  await click(b3(/Sort by category instead/));
  assert(/section for its category/.test(text3()), "Sort by category instead goes back to the default");
  await act(async () => st.saveWorkout({ ...day3(), exercises: day3().exercises.slice(0, -1) }));
  await click(b3(/^Done$/));

  await click(b3(/＋ Section/));
  assert(day3().sections.length === 3 && day3().sections[2].title === "Section 3", "＋ Section adds a numbered section");
  const nameInput = [...host3.querySelectorAll("input")].find((i) => i.defaultValue === "Section 3");
  assert(!!nameInput, "…with its name open for editing");
  await blurWith(nameInput, "Post climbing");
  assert(day3().sections[2].title === "Post climbing", "renaming it saves the title");
  assert(/Empty — drag exercises here/.test(text3()), "an empty section invites drops");
  assert(host3.querySelectorAll('button[aria-label^="Drag to reorder"]').length === 3, "each exercise has a drag handle");
  assert(!host3.querySelector('button[aria-label="Move up"]'), "the ↑/↓ buttons are gone");
  await act(async () => root3.unmount());

  // A day that's still a plain list gets organized by category on the next add.
  const DAY4 = "2026-10-18";
  st.applyWorkoutToDates(
    { sections: [], exercises: [{ id: "f1", exerciseId: shrugs.id, name: "Shrugs", category: "strength_conditioning", measureType: "reps", status: "none" }] },
    [DAY4],
    "replace",
  );
  const host4 = document.createElement("div");
  document.body.appendChild(host4);
  const root4 = createRoot(host4);
  await act(async () =>
    root4.render(React.createElement(MemoryRouter, null, React.createElement(WorkoutDayView, { date: DAY4 }))),
  );
  const day4 = () => activeWorkouts(useStore.getState()).find((w) => w.date === DAY4);
  await click([...host4.querySelectorAll("button")].find((b) => /＋ Exercise/.test(b.textContent)));
  await click([...host4.querySelectorAll("button")].find((b) => b.textContent.startsWith("Pull ups")));
  assert(day4().sections.length === 1 && day4().exercises.length === 2 && day4().exercises.every((e) => e.sectionId === day4().sections[0].id), "a plain list is organized by category on the next add");
  await act(async () => root4.unmount());
}
console.log(failures === 0 ? "\nDAY VIEW OK ✅" : `\n${failures} FAILURES ❌`);
process.exit(failures ? 1 : 0);
