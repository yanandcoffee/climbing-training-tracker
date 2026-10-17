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

console.log("Copying onto a day with progress:");
{
  const radio = (re) => buttons().find((b) => b.getAttribute("role") === "radio" && re.test(b.textContent));
  await click(btn(/Copy from…/));
  assert(radio(/Add to it/)?.getAttribute("aria-checked") === "true", "a day with something done defaults to Add to it");
  await click(radio(/Replace it/));
  assert(/Replacing erases what you've done on 12 Oct \(1 exercise marked or logged\)/.test(host.textContent), "choosing Replace warns what it erases");
  await click(radio(/Add to it/));
  await click(btn(/Shoulder session/));
  assert(dayWorkout().exercises.filter((e) => e.name === "Shrugs").length === 1, "copying a workout with Shrugs again doesn't add a second Shrugs");
  assert(dayWorkout().exercises.find((e) => e.name === "Shrugs").status === "complete", "…and today's Shrugs keeps its progress");
}

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

console.log("Section menu:");
{
  const DAY5 = "2026-10-22";
  const ex = (id, name, sectionId, extra = {}) => ({ id, name, sectionId, category: "core", measureType: "reps", status: "none", ...extra });
  st.applyWorkoutToDates(
    {
      sections: [
        { id: "A", title: "Warm up" },
        { id: "B", title: "Post climbing" },
        { id: "C", title: "Empty one" },
      ],
      exercises: [ex("a1", "Wrist circles", "A"), ex("b1", "Rows", "B", { status: "complete" }), ex("b2", "Curls", "B")],
    },
    [DAY5],
    "replace",
  );
  {
    // Copying resets progress, so mark Rows done afterwards.
    const w = activeWorkouts(useStore.getState()).find((x) => x.date === DAY5);
    st.saveWorkout({ ...w, exercises: w.exercises.map((e) => (e.name === "Rows" ? { ...e, status: "complete" } : e)) });
  }
  const host5 = document.createElement("div");
  document.body.appendChild(host5);
  const root5 = createRoot(host5);
  await act(async () =>
    root5.render(React.createElement(MemoryRouter, null, React.createElement(WorkoutDayView, { date: DAY5 }))),
  );
  const day5 = () => activeWorkouts(useStore.getState()).find((w) => w.date === DAY5);
  const titles = () => day5().sections.map((s) => s.title).join("|");
  const b5 = (re) => [...host5.querySelectorAll("button")].find((b) => re.test(b.textContent));
  const menuFor = (title) => host5.querySelector(`button[aria-label="Section options for ${title}"]`);
  const item = (re) => [...host5.querySelectorAll('[role="menuitem"]')].find((b) => re.test(b.textContent));

  await click(menuFor("Warm up"));
  assert(!!item(/Rename/) && !!item(/Move down/) && !!item(/Reorder sections/) && !!item(/Delete section/), "⋯ opens Rename / Move / Reorder / Delete");
  assert(item(/Move up/).disabled, "…Move up is disabled for the first section");
  await click(item(/Move down/));
  assert(titles() === "Post climbing|Warm up|Empty one", "Move down swaps it with the next section");
  assert(!host5.querySelector('[role="menu"]'), "…and closes the menu");
  await click(menuFor("Warm up"));
  await click(item(/Move up/));
  assert(titles() === "Warm up|Post climbing|Empty one", "Move up moves it back");

  await click(menuFor("Warm up"));
  await click(item(/Reorder sections/));
  assert(/Reorder sections/.test(host5.textContent) && host5.querySelectorAll('button[aria-label^="Drag to reorder section"]').length === 3, "Reorder sections shows a compact draggable list");
  assert(!host5.textContent.includes("Wrist circles"), "…without the exercises");
  await click(b5(/^Done$/));
  assert(host5.textContent.includes("Wrist circles"), "Done goes back to the workout");

  // Combine with…: Empty one into Post climbing (then put things back for the delete tests).
  await click(menuFor("Warm up"));
  await click(item(/Combine with/));
  assert(/Combine “Warm up” into… Its 1 exercise moves to the end/.test(host5.textContent.replace(/\s+/g, " ")), "Combine with… says what will move");
  await click(b5(/^Post climbing$/));
  assert(titles() === "Post climbing|Empty one", "combining removes the section");
  assert(day5().exercises.map((e) => e.name).join(",") === "Rows,Curls,Wrist circles" && day5().exercises.every((e) => e.sectionId === day5().sections[0].id), "…and its exercises join the end of the chosen one");

  // Renaming to an existing name asks before combining.
  const rename = async (title, to) => {
    await click([...host5.querySelectorAll("button[title='Rename section']")].find((b) => b.textContent.startsWith(title)));
    const input = [...host5.querySelectorAll("input")].find((i) => i.defaultValue === title);
    await blurWith(input, to);
  };
  await rename("Empty one", "post CLIMBING");
  assert(titles() === "Post climbing|Empty one", "renaming to an existing section's name doesn't make a duplicate");
  assert(/There's already a “Post climbing” section\. Combine “Empty one” into it\?/.test(host5.textContent), "…it asks to combine instead");
  await click(b5(/^Cancel \(keep/));
  assert(titles() === "Post climbing|Empty one", "Cancel keeps both as they were");
  await rename("Empty one", "Post climbing");
  await click(b5(/^Combine into Post climbing$/));
  assert(titles() === "Post climbing", "Combine merges them");

  // Restore a Warm up section above for the delete tests.
  await act(async () => {
    const w = day5();
    st.saveWorkout({
      ...w,
      sections: [{ id: "A", title: "Warm up" }, { ...w.sections[0] }, { id: "C", title: "Empty one" }],
      exercises: w.exercises.map((e) => (e.name === "Wrist circles" ? { ...e, sectionId: "A" } : e)),
    });
  });

  await click(menuFor("Empty one"));
  await click(item(/Delete section/));
  assert(titles() === "Warm up|Post climbing", "an empty section is deleted without asking");

  await click(menuFor("Post climbing"));
  await click(item(/Delete section/));
  const text5 = host5.textContent.replace(/\s+/g, " ");
  assert(/Delete “Post climbing”\? It has 2 exercises \(1 with progress marked or logged\)/.test(text5), "deleting a section with exercises asks first, noting progress");
  assert(!!b5(/Keep the exercises → move to Warm up/) && !!b5(/Delete the section and its 2 exercises/), "…offering to keep them (named destination) or delete them");
  await click(b5(/^Cancel$/));
  assert(titles() === "Warm up|Post climbing", "Cancel changes nothing");

  await click(menuFor("Post climbing"));
  await click(item(/Delete section/));
  await click(b5(/Keep the exercises/));
  assert(titles() === "Warm up" && day5().exercises.map((e) => e.name).join(",") === "Wrist circles,Rows,Curls", "keeping moves them into Warm up");
  assert(day5().exercises.every((e) => e.sectionId === day5().sections[0].id) && day5().exercises[1].status === "complete", "…with their progress");

  await click(menuFor("Warm up"));
  await click(item(/Delete section/));
  assert(!!b5(/leave them without a section/), "the last section offers to leave its exercises without a section");
  await click(b5(/Delete the section and its 3 exercises/));
  assert(day5().sections.length === 0 && day5().exercises.length === 0, "deleting with its exercises removes them all");
  await act(async () => root5.unmount());
}
console.log("On/off intervals and loads:");
{
  const DAY6 = "2026-10-26";
  const rep = st.addExercise({ name: "Repeaters", category: "strength_conditioning", measureType: "intervals" });
  st.applyWorkoutToDates(
    {
      sections: [],
      exercises: [{ id: "r", exerciseId: rep.id, name: "Repeaters", category: "strength_conditioning", measureType: "intervals", status: "none" }],
    },
    [DAY6],
    "replace",
  );
  const host6 = document.createElement("div");
  document.body.appendChild(host6);
  const root6 = createRoot(host6);
  await act(async () =>
    root6.render(React.createElement(MemoryRouter, null, React.createElement(WorkoutDayView, { date: DAY6 }))),
  );
  const item6 = () => activeWorkouts(useStore.getState()).find((w) => w.date === DAY6).exercises[0];
  const b6 = (re) => [...host6.querySelectorAll("button")].find((b) => re.test(b.textContent));
  const field6 = (re) => [...host6.querySelectorAll("label")].find((l) => re.test(l.textContent))?.querySelector("input, select");
  const choose = (select, value) =>
    act(async () => {
      select.value = value;
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });

  await click(b6(/^Repeaters/));
  assert(!!field6(/^On \(sec\)/) && !!field6(/^Off \(sec\)/) && !!field6(/^Reps per set/), "intervals ask for on, off and reps per set");
  await blurWith(field6(/^Sets/), "5");
  await blurWith(field6(/^On \(sec\)/), "7");
  await blurWith(field6(/^Off \(sec\)/), "3");
  assert(/5 × 7s on \/ 3s off/.test(host6.textContent), "row shows 5 × 7s on / 3s off");

  const loadSelect = field6(/^Load/);
  assert(loadSelect?.tagName === "SELECT" && loadSelect.value === "bodyweight", "intervals load starts as Bodyweight");
  assert(![...loadSelect.options].some((o) => o.value === "none"), "…with no separate No load choice");
  assert(/5 × 7s on \/ 3s off @ bodyweight/.test(host6.textContent), "…and the row reads @ bodyweight");
  await choose(loadSelect, "bodyweight");
  assert(item6().prescription.weight === 0 && /@ bodyweight/.test(host6.textContent), "Bodyweight stores 0 and reads “@ bodyweight”");
  await choose(field6(/^Load/), "assisted");
  assert(item6().prescription.weight === undefined && !!field6(/^Taken off/), "Assisted asks how much is taken off");
  await blurWith(field6(/^Taken off/), "15");
  assert(item6().prescription.weight === -15, "15 taken off is stored as −15");
  assert(/@ −15 lb assisted/.test(host6.textContent), "row reads “@ −15 lb assisted”");
  await choose(field6(/^Load/), "added");
  assert(item6().prescription.weight === 15, "switching to Added weight keeps the amount, now added");
  await choose(field6(/^Load/), "assisted");

  const loadIn = () => host6.querySelector('input[aria-label="Load lb"]');
  const signBtn = () => loadIn().previousElementSibling;
  assert([...host6.querySelectorAll("label")].some((l) => l.textContent.startsWith("Seconds on")), "each set logs seconds on");
  assert(signBtn().textContent === "−", "a set's load starts as assisted when the target is assisted");
  await blurWith(loadIn(), "12");
  assert(item6().metrics.sets[0].weight === -12, "typing 12 logs −12");
  await click(signBtn());
  assert(item6().metrics.sets[0].weight === 12 && signBtn().textContent === "+", "the +/− button flips it to added");
  await blurWith(loadIn(), "0");
  assert(item6().metrics.sets[0].weight === 0, "0 logs bodyweight");

  await blurWith(field6(/^Reps per set/), "6");
  assert(/5 sets × 6 reps · 7s on \/ 3s off/.test(host6.textContent), "with reps per set the row reads 5 sets × 6 reps · 7s on / 3s off");
  assert([...host6.querySelectorAll("label")].some((l) => /^Reps$/.test(l.firstChild?.textContent ?? "")), "…and each set logs reps instead of seconds");
  await act(async () => root6.unmount());
}
console.log(failures === 0 ? "\nDAY VIEW OK ✅" : `\n${failures} FAILURES ❌`);
process.exit(failures ? 1 : 0);
