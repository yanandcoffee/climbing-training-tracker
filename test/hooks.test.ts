// Confirms the zustand v5 selector fix: the memoized hooks must return a
// referentially STABLE value across unrelated store updates, and must not drive
// an infinite render loop under React's real useSyncExternalStore. Before the
// useShallow fix, mounting a component that uses these hooks throws
// "Maximum update depth exceeded" here.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.IS_REACT_ACT_ENVIRONMENT = true;

// localStorage polyfill (store persists through it)
const mem = new Map<string, string>();
g.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const store = await import("../src/store/useStore");

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

// Seed some data through the store's real actions.
const s = store.useStore.getState();
s.addExercise({ name: "Pull-ups", category: "strength_conditioning", measureType: "reps" });
s.addExercise({ name: "Plank", category: "core", measureType: "hold" });

let renders = 0;
const seen: unknown[] = [];

const Probe: React.FC = () => {
  renders++;
  const exercises = store.useActiveExercises();
  const checkIns = store.useActiveCheckIns();
  seen.push(exercises);
  // Touch checkIns so its hook is subscribed too.
  void checkIns.length;
  return null;
};

const host = dom.window.document.createElement("div");
const root = createRoot(host);

await act(async () => {
  root.render(React.createElement(Probe));
});
const rendersAfterMount = renders;
assert(rendersAfterMount > 0 && rendersAfterMount < 25, `initial mount settled (${rendersAfterMount} renders, no loop)`);

// An update that does NOT change the exercises slice (adds a check-in).
await act(async () => {
  store.useStore.getState().upsertCheckIn("2026-02-03", { color: "green", quality: 1 });
});
const exRefA = seen[seen.length - 2];
const exRefB = seen[seen.length - 1];
assert(exRefA === exRefB, "exercises reference stayed stable across an unrelated update");
assert(renders < 40, `bounded re-renders after unrelated update (${renders} total)`);

// An update that DOES change exercises yields a new reference.
const beforeLen = (seen[seen.length - 1] as unknown[]).length;
await act(async () => {
  store.useStore.getState().addExercise({ name: "Mobility flow", category: "mobility", measureType: "duration" });
});
const afterRef = seen[seen.length - 1] as unknown[];
assert(afterRef.length === beforeLen + 1, "exercises hook reflects a real change");

await act(async () => root.unmount());

console.log(failures === 0 ? "\nHOOK STABILITY OK ✅" : `\n${failures} FAILURES ❌`);
if (failures) process.exit(1);
