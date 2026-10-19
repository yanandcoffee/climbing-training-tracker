// Drives the real CalendarScreen in jsdom: the week view it opens on, week
// navigation, tapping into a day, and rescheduling by drop (swap / move / undo).
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
// A second import gives unbound exports (<Routes> checks children by identity).
const { Routes, Route, useParams } = await jiti.import("react-router-dom");
const { addDays, startOfWeek, format } = await jiti.import("date-fns");
const CalendarScreen = (await jiti.import("../src/screens/CalendarScreen")).default;
const UndoToast = (await jiti.import("../src/components/UndoButton")).default;
const { dropWorkout, weekTitle } = await jiti.import("../src/components/WeekView");
const { useStore, activeWorkouts } = await jiti.import("../src/store/useStore");
const { dateKey } = await jiti.import("../src/lib/dates");

let failures = 0;
const assert = (cond, msg) => {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

// ---- seed this week: a part-done workout today, one later in the week ------
const weekStart = startOfWeek(new Date());
const day = (i) => dateKey(addDays(weekStart, i));
const TODAY = dateKey(new Date());
const todayIdx = new Date().getDay();
const OTHER = day(todayIdx === 3 ? 4 : 3); // a different day this week
const REST = day([0, 1, 2, 5, 6].find((i) => day(i) !== TODAY && day(i) !== OTHER));
const st = useStore.getState();
const item = (id, name, status = "none") => ({ id, name, category: "strength_conditioning", measureType: "reps", status });
st.applyWorkoutToDates(
  { name: "Finger strength", sections: [], exercises: ["Max hangs", "Pull ups", "Shrugs", "Rows", "Dips"].map((n, i) => item(`f${i}`, n)) },
  [TODAY],
  "replace",
);
{
  const w = activeWorkouts(useStore.getState()).find((x) => x.date === TODAY);
  st.saveWorkout({ ...w, exercises: w.exercises.map((e, i) => (i === 0 ? { ...e, status: "complete" } : e)) });
}
st.applyWorkoutToDates({ name: "Endurance", sections: [], exercises: [item("e0", "4x4s"), item("e1", "Core")] }, [OTHER], "replace");
st.upsertCheckIn(TODAY, { color: "green", quality: 1 });

const on = (d) => activeWorkouts(useStore.getState()).find((w) => w.date === d);

function DayPage() {
  const { date } = useParams();
  return React.createElement("p", { id: "day-page" }, `Day ${date}`);
}

const host = document.createElement("div");
document.body.appendChild(host);
const root = createRoot(host);
const h = React.createElement;
let mounts = 0;
// Keyed: a MemoryRouter ignores new initialEntries, so each render starts over at /calendar.
const render = () =>
  act(async () =>
    root.render(
      h(
        MemoryRouter,
        { key: ++mounts, initialEntries: ["/calendar"] },
        h(Routes, null,
          h(Route, { path: "/calendar", element: h(CalendarScreen) }),
          h(Route, { path: "/day/:date", element: h(DayPage) }),
        ),
        h(UndoToast),
      ),
    ),
  );
await render();

const click = (el) => act(async () => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
const btn = (re) => [...host.querySelectorAll("button")].find((b) => re.test(b.textContent));
const row = (d) => host.querySelector(`li[data-date="${d}"]`);

console.log("Week view:");
assert(btn(/^Week$/)?.getAttribute("aria-pressed") === "true", "Calendar opens on Week");
assert(host.querySelectorAll("li[data-date]").length === 7 && !!row(day(0)) && !!row(day(6)), "one row per day, Sunday to Saturday");
assert(host.textContent.includes(weekTitle(weekStart)) && /This week/.test(host.textContent), "the bar shows this week's dates");
const todayText = row(TODAY).textContent;
assert(/Finger strength/.test(todayText) && /1\/5 done/.test(todayText), "today's card: name and 1/5 done");
assert(/Max hangs · Pull ups · Shrugs \+2/.test(todayText), "…its first exercises, then +2");
assert(!!row(TODAY).querySelector(".bg-sky-500[style]"), "…and a progress bar");
assert(!!row(TODAY).querySelector('span[title="Check-in: green"]'), "today shows its check-in dot");
assert(/Endurance/.test(row(OTHER).textContent) && /2 exercises/.test(row(OTHER).textContent), "a workout with nothing marked shows how many exercises");
assert(/Rest/.test(row(REST).textContent) && /＋ Plan/.test(row(REST).textContent), "an empty day is Rest, with ＋ Plan");

console.log("Week navigation:");
await click(host.querySelector('button[aria-label="next week"]'));
assert(host.textContent.includes(weekTitle(addDays(weekStart, 7))), "› goes to next week");
assert(!!btn(/^Back to this week$/) && !/Finger strength/.test(host.textContent), "…offers Back to this week");
await click(host.querySelector('button[aria-label="previous week"]'));
await click(host.querySelector('button[aria-label="previous week"]'));
assert(host.textContent.includes(weekTitle(addDays(weekStart, -7))), "‹ goes back a week");
await click(btn(/^Back to this week$/));
assert(/This week/.test(host.textContent) && /Finger strength/.test(host.textContent), "Back to this week returns");
assert(weekTitle(new Date(2026, 8, 27)) === "27 Sep – 3 Oct" && weekTitle(new Date(2026, 9, 18)) === "18 – 24 October", "titles across and within a month");
assert(weekTitle(new Date(2030, 0, 6)) === "6 – 12 January 2030", "…with the year when it isn't this year");

console.log("Month view:");
const weekArrow = host.querySelector('button[aria-label="previous week"]').className;
await click(btn(/^Month$/));
assert(!!host.querySelector('button[aria-label="previous month"]') && !host.querySelector("li[data-date]"), "Month switches to the month grid");
assert(host.querySelector('button[aria-label="previous month"]').className === weekArrow, "its arrows are the same size as the week's");
assert(/This month/.test(host.textContent), "…and it says This month, like This week");
await click(host.querySelector('button[aria-label="next month"]'));
await click(btn(/^Back to this month$/));
assert(/This month/.test(host.textContent) && !btn(/^Back to this month$/), "Back to this month returns");
await click(btn(/^Week$/));
assert(host.querySelectorAll("li[data-date]").length === 7, "…and Week back");

console.log("Rescheduling by drop:");
await act(async () => {
  assert(dropWorkout(TODAY, `day:${OTHER}`), "dropping on a day with a workout moves it");
});
assert(on(OTHER).name === "Finger strength" && on(TODAY).name === "Endurance", "…the two days swap");
assert(on(OTHER).exercises[0].status === "complete", "…keeping the checkmarks");
assert(/Swapped/.test(host.textContent) && /Finger strength/.test(row(OTHER).textContent), "the rows update and the toast names the swap");
await click(host.querySelector('button[aria-label^="Undo Swapped"]'));
assert(on(TODAY).name === "Finger strength" && on(OTHER).name === "Endurance", "Undo swaps them back");
await act(async () => {
  dropWorkout(TODAY, `day:${REST}`);
});
assert(on(REST)?.name === "Finger strength" && on(TODAY).exercises.length === 0, "dropping on a rest day just moves it");
assert(/Rest/.test(row(TODAY).textContent), "…leaving a rest day behind");
await act(async () => useStore.getState().undo());
assert(!dropWorkout(TODAY, `day:${TODAY}`) && !dropWorkout(TODAY, "edge:next") && !dropWorkout(TODAY, null), "dropping on itself, an edge strip, or nowhere does nothing");
assert(on(TODAY).name === "Finger strength", "…and today still has its workout");

console.log("Tapping:");
await click(row(TODAY).querySelector("button"));
assert(host.querySelector("#day-page")?.textContent === `Day ${TODAY}`, "tapping a card opens that day");
await render();
await click(row(REST).querySelector("button"));
assert(host.querySelector("#day-page")?.textContent === `Day ${REST}`, "tapping a rest day opens it to plan");

await act(async () => root.unmount());
console.log(failures === 0 ? "\nCALENDAR OK ✅" : `\n${failures} FAILURES ❌`);
process.exit(failures ? 1 : 0);
