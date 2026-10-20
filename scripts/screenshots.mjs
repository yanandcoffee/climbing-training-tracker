// Screenshots for the README: seeds demo data (never your own) and captures the
// app at iPhone size, in dark mode, with headless Chrome over the DevTools protocol.
//
//   npm run build && npx vite preview --port 4795
//   node scripts/screenshots.mjs http://localhost:4795 docs/screenshots [sceneName]
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const [base, outDir, only] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// ---------- demo data ----------
const TODAY = new Date(2026, 9, 18); // Sun 18 Oct 2026
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plus = (n) => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + n);
const T = 1760000000000;

const LIB = [
  ["ex-wrist", "Wrist & finger warm up", "warm_up", "check"],
  ["ex-traverse", "Easy traverse", "warm_up", "duration"],
  ["ex-limit", "Limit boulders", "on_wall_drills", "check"],
  ["ex-4x4", "4x4 boulders", "on_wall_drills", "check"],
  ["ex-silent", "Silent feet drill", "on_wall_drills", "check"],
  ["ex-hang", "Max hangs 20mm", "strength_conditioning", "hold"],
  ["ex-rep", "Repeaters 7/3", "strength_conditioning", "intervals"],
  ["ex-pull", "Weighted pull-ups", "strength_conditioning", "reps"],
  ["ex-lever", "Front lever tuck", "core", "hold"],
  ["ex-legs", "Hanging leg raises", "core", "reps"],
  ["ex-hips", "Hip mobility flow", "mobility", "duration"],
];
const exercises = LIB.map(([id, name, category, measureType]) => ({
  id, name, category, measureType, updatedAt: T,
  ...(id === "ex-hang" && { description: "Full crimp, shoulders engaged, stop before failure." }),
}));
const lib = Object.fromEntries(LIB.map(([id, name, category, measureType]) => [id, { name, category, measureType }]));

let n = 0;
const item = (exId, sectionId, prescription, status = "none", metrics) => ({
  id: `i${++n}`, exerciseId: exId, sectionId, ...lib[exId], prescription, status, ...(metrics && { metrics }),
});
const SEC = [
  { id: "s-warm", title: "Warm up" },
  { id: "s-wall", title: "On the wall" },
  { id: "s-str", title: "Strength" },
  { id: "s-core", title: "Core" },
];

const workouts = [];
const add = (offset, name, exs, sections = SEC) =>
  workouts.push({ id: `wo-${key(plus(offset))}`, date: key(plus(offset)), name, sections: sections.filter((s) => exs.some((e) => e.sectionId === s.id)), exercises: exs, updatedAt: T });

// Six weeks of history: strength days progress the hang load and pull-up weight.
for (let w = 6; w >= 1; w--) {
  const k = 6 - w; // 0..5
  const hang = 5 + k * 4; // +5 → +25 lb
  const pull = 10 + k * 3; // +10 → +25 lb
  const lever = 8 + k * 2; // 8 → 18 s
  add(-7 * w - 6, "Finger strength", [
    item("ex-wrist", "s-warm", undefined, "complete"),
    item("ex-hang", "s-str", { sets: 5, holdSec: 10, weight: hang, weightUnit: "lb" }, "complete",
      { sets: Array.from({ length: 5 }, () => ({ durationSec: 10, weight: hang })), weight: hang, durationSec: 10, rpe: 7 + (k % 2) }),
    item("ex-pull", "s-str", { sets: 4, reps: 5, weight: pull, weightUnit: "lb" }, k === 2 ? "partial" : "complete",
      { sets: Array.from({ length: 4 }, (_, i) => ({ reps: k === 2 && i === 3 ? 3 : 5, weight: pull })), reps: 5, weight: pull }),
    item("ex-lever", "s-core", { sets: 4, holdSec: lever }, "complete", { durationSec: lever, sets: Array.from({ length: 4 }, () => ({ durationSec: lever })) }),
  ]);
  add(-7 * w - 4, "Power", [
    item("ex-traverse", "s-warm", { holdSec: 300 }, "complete"),
    item("ex-limit", "s-wall", undefined, "complete"),
    item("ex-legs", "s-core", { sets: 3, reps: 8 + k }, w === 3 ? "skipped" : "complete", { reps: 8 + k }),
  ]);
  add(-7 * w - 1, "Endurance", [
    item("ex-traverse", "s-warm", { holdSec: 300 }, "complete"),
    item("ex-4x4", "s-wall", undefined, "complete"),
    item("ex-rep", "s-str", { sets: 6, holdSec: 7, restSec: 3, weight: -10, weightUnit: "lb" }, "complete"),
    item("ex-hips", "s-core", { holdSec: 600 }, "complete"),
  ]);
}

// This week (Sun 18 – Sat 24): today in progress, the rest planned.
add(0, "Finger strength", [
  item("ex-wrist", "s-warm", undefined, "complete"),
  item("ex-traverse", "s-warm", { holdSec: 300 }, "complete"),
  item("ex-limit", "s-wall", undefined, "partial"),
  item("ex-hang", "s-str", { sets: 5, holdSec: 10, weight: 30, weightUnit: "lb" }),
  item("ex-pull", "s-str", { sets: 4, reps: 5, weight: 30, weightUnit: "lb" }),
  item("ex-lever", "s-core", { sets: 4, holdSec: 20 }),
  item("ex-legs", "s-core", { sets: 3, reps: 12 }),
]);
add(2, "Power", [
  item("ex-traverse", "s-warm", { holdSec: 300 }),
  item("ex-limit", "s-wall"),
  item("ex-silent", "s-wall"),
  item("ex-legs", "s-core", { sets: 3, reps: 12 }),
]);
add(4, "Endurance", [
  item("ex-4x4", "s-wall"),
  item("ex-rep", "s-str", { sets: 6, holdSec: 7, restSec: 3, weight: -10, weightUnit: "lb" }),
]);
add(5, "Mobility", [item("ex-hips", "s-core", { holdSec: 900 })]);

// Check-ins most days: mostly green, a rough patch mid-September, one off day.
const SEQ = [3, 2, 3, 4, 2, 3, 0, 3, 4, 3, 0, -1, -3, -4, -3, 0, 2, 3, 3, 4, 2, 3, 4, 3, 0, 3, 4, 5, 3, 2, 4, 3, -2, 0, 3, 4, 4, 5, 3, 4, 4, 5];
const colorOf = (p) => (p >= 1 ? "green" : p === 0 ? "yellow" : p >= -2 ? "orange" : "red");
const QUAL = { green: (p) => (p - 1) / 4, yellow: () => 0, orange: (p) => -p / 2, red: (p) => (-p - 3) / 2 };
const checkIns = SEQ.map((points, i) => {
  const d = i - SEQ.length;
  const color = colorOf(points);
  return { id: `ci-${key(plus(d))}`, date: key(plus(d)), color, quality: QUAL[color](points), points, updatedAt: T };
});
// Today: not checked in yet, so the card invites it.
const todayKey = key(TODAY);
const checkInsShown = checkIns.filter((c) => c.date !== todayKey);

const snapshot = {
  version: 1, checkIns: checkInsShown, exercises, workouts, templates: [], schedule: [],
  settings: { provider: "gemini", anthropicModel: "claude-opus-4-8", openaiModel: "gpt-4.1", geminiModel: "gemini-3.8-flash" },
};

// ---------- CDP ----------
const port = 9333;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "ctt-shots-"))}`,
  "--hide-scrollbars", "--no-first-run", "--disable-gpu", "about:blank",
], { stdio: "ignore" });
process.on("exit", () => chrome.kill());

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const W = 402, H = 874, DPR = 2;
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await send("Emulation.setTimezoneOverride", { timezoneId: "America/New_York" });
// Freeze the clock at 18 Oct 2026, 08:30, so "today" matches the data.
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    const fixed = new Date(2026, 9, 18, 8, 30).getTime(), start = Date.now(), R = Date;
    class D extends R { constructor(...a) { super(...(a.length ? a : [fixed + (R.now() - start)])); } static now() { return fixed + (R.now() - start); } }
    globalThis.Date = D;
    localStorage.setItem("ctt.snapshot.v1", ${JSON.stringify(JSON.stringify(snapshot))});
    navigator.serviceWorker && Object.defineProperty(navigator, "serviceWorker", { value: undefined });
  })();`,
});

const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expr}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
};
const go = async (path) => {
  await send("Page.navigate", { url: base + path });
  await sleep(1500);
};
const clickText = (re, sel = "button, a") =>
  evalJs(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => ${re}.test(b.textContent.trim()) || ${re}.test(b.getAttribute("aria-label") ?? "")); if (!el) throw new Error("no " + ${JSON.stringify(String(re))}); el.click(); })()`).then(() => sleep(500));
const scrollTo = (selOrText) =>
  evalJs(`(() => { const el = [...document.querySelectorAll("h2, h3, p, span, div, section")].find((e) => e.textContent.trim().startsWith(${JSON.stringify(selOrText)}) && e.children.length < 4); if (!el) throw new Error("no ${selOrText}"); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 12); })()`).then(() => sleep(400));
const scrollToSel = (sel) =>
  evalJs(`window.scrollTo(0, document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().top + scrollY - 40)`).then(() => sleep(400));
const shot = async (name) => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(data, "base64"));
  console.log("saved", name);
};
const touch = (type, x, y) => send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
const rectOf = (text) => evalJs(`(() => { const el = [...document.querySelectorAll("li[data-date] button, li[data-date] [role=button], li[data-date] div")].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)})); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);

const scenes = {
  async today() {
    await go("/");
    await shot("today");
  },
  async workout() {
    await go("/");
    await scrollToSel('input[aria-label="Workout name"]');
    await shot("workout");
  },
  async menu() {
    await go("/");
    await scrollToSel('input[aria-label="Workout name"]');
    await clickText(/^More actions$/);
    await shot("menu");
  },
  async week() {
    await go("/calendar");
    await shot("calendar-week");
  },
  async drag() {
    await go("/calendar");
    const from = await rectOf("Power");
    await touch("touchStart", from.x, from.y);
    await sleep(450);
    for (let i = 1; i <= 12; i++) { await touch("touchMove", from.x, from.y + i * 6); await sleep(30); }
    await sleep(400);
    await shot("calendar-drag");
    await touch("touchEnd");
  },
  async month() {
    await go("/calendar");
    await clickText(/^Month$/);
    await shot("calendar-month");
  },
  async progress() {
    await go("/progress");
    await shot("progress");
  },
  async exercise() {
    await go("/exercise/ex-hang");
    await clickText(/^Load$/);
    await shot("exercise");
  },
  async library() {
    await go("/exercises");
    await shot("exercises");
  },
};

for (const [name, fn] of Object.entries(scenes)) {
  if (only && only !== name) continue;
  try { await fn(); } catch (e) { console.log("FAILED", name, e.message); }
}
ws.close();
chrome.kill();
process.exit(0);
