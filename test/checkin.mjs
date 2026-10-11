// Drives the real CheckInCard in jsdom: choices are a draft until Submit is pressed.
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

const jiti = createJiti(import.meta.url, { jsx: true, moduleCache: true });
const React = (await jiti.import("react")).default;
g.React = React;
const { act } = await jiti.import("react");
const { createRoot } = await jiti.import("react-dom/client");
const CheckInCard = (await jiti.import("../src/components/CheckInCard")).default;
const { useStore, checkInForDate } = await jiti.import("../src/store/useStore");

let failures = 0;
const assert = (cond, msg) => {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

const DATE = "2026-10-11";
const host = document.createElement("div");
document.body.appendChild(host);
const root = createRoot(host);
await act(async () => root.render(React.createElement(CheckInCard, { date: DATE })));

const click = (el) => act(async () => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
const saved = () => checkInForDate(useStore.getState(), DATE);
const submitBtn = () => [...host.querySelectorAll("button")].find((b) => /check-in|Submitted/.test(b.textContent));
const slot = (label) => [...host.querySelectorAll('[role="radio"]')].find((b) => b.textContent === label);
const swatch = (name) => host.querySelector(`button[aria-label="${name}"]`);

console.log("Check-in submit:");
assert(submitBtn().textContent === "Submit check-in" && !submitBtn().disabled, "starts with an enabled Submit button");
assert(!saved(), "nothing saved on first render");

await click(slot("+3"));
assert(!saved(), "tapping a green score does NOT save it");
assert(host.querySelector('[aria-label="readiness points"]').textContent === "+3", "draft badge shows +3");

await click(submitBtn());
assert(saved()?.points === 3 && saved()?.color === "green", "Submit saves green +3");
assert(submitBtn().textContent === "✓ Submitted" && submitBtn().disabled, "button shows Submitted and is disabled when clean");

await click(slot("+5"));
assert(saved()?.points === 3, "changing the score after submit does not auto-save");
assert(submitBtn().textContent === "Update check-in" && !submitBtn().disabled, "button becomes Update check-in");

await click(swatch("red"));
assert(saved()?.color === "green", "switching color does not auto-save");
await click(submitBtn());
assert(saved()?.color === "red" && saved()?.points === -3, "Update saves red −3 (mildest red slot)");
assert(useStore.getState().checkIns.filter((c) => c.date === DATE).length === 1, "still one check-in for the date");

await act(async () => root.unmount());
console.log(failures === 0 ? "\nCHECK-IN OK ✅" : `\n${failures} FAILURES ❌`);
process.exit(failures ? 1 : 0);
