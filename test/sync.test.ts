// Sync engine tests: the real engine against a fake server that mirrors the SQL
// trigger (stale writes skipped, server-assigned synced_at), with two devices.
import {
  keyOf,
  mergeRows,
  snapshotToRows,
  syncCycle,
  emptySyncState,
  reconcileSettings,
  type RemoteBackend,
  type Row,
  type SettingsBackend,
  type SettingsRow,
  type SyncState,
} from "../src/sync/engine";
import { emptySnapshot, normalizeSnapshot } from "../src/storage/StorageAdapter";
import type { CheckIn, Exercise, Settings, Snapshot, Workout } from "../src/types";

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

// ---- fake server -----------------------------------------------------------
class FakeServer {
  rows = new Map<string, Row>();
  private clock = 0;
  pushes = 0;

  backend(): RemoteBackend {
    return {
      pull: async (since) =>
        [...this.rows.values()]
          .filter((r) => !since || r.synced_at! >= since)
          .sort((a, b) => a.synced_at!.localeCompare(b.synced_at!))
          .map((r) => ({ ...r })),
      push: async (rows) => {
        this.pushes += rows.length;
        for (const r of rows) {
          const k = keyOf(r.kind, r.id);
          const old = this.rows.get(k);
          if (old && r.updated_at <= old.updated_at) continue; // trigger: skip stale
          this.rows.set(k, {
            ...r,
            synced_at: `2026-01-01T00:00:${String(++this.clock).padStart(6, "0")}Z`,
          });
        }
      },
    };
  }
}

// ---- simulated device ------------------------------------------------------
class Device {
  snap: Snapshot = emptySnapshot();
  state: SyncState = emptySyncState("user-1");
  constructor(private server: FakeServer) {}

  async sync(hookDuringPull?: () => void) {
    const base = this.server.backend();
    const backend: RemoteBackend = hookDuringPull
      ? {
          push: base.push,
          pull: async (s) => {
            const rows = await base.pull(s);
            hookDuringPull(); // a local edit lands while the request is in flight
            return rows;
          },
        }
      : base;
    const r = await syncCycle({
      backend,
      state: this.state,
      getSnapshot: () => this.snap,
      applyRows: (rows) => {
        this.snap = mergeRows(this.snap, rows).snapshot;
      },
    });
    this.state = r.state;
    return r;
  }
}

const exercise = (id: string, name: string, updatedAt: number): Exercise => ({
  id,
  name,
  category: "core",
  measureType: "reps",
  updatedAt,
});
const checkIn = (date: string, points: number, updatedAt: number): CheckIn => ({
  id: `ci-${date}`,
  date,
  color: "green",
  quality: 1,
  points,
  updatedAt,
});
const workout = (date: string, updatedAt: number, n = 0): Workout => ({
  id: `wo-${date}`,
  date,
  updatedAt,
  exercises: Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    name: `Ex ${i}`,
    category: "core" as const,
    measureType: "reps" as const,
    status: "none" as const,
  })),
});

// ---- 1. basic propagation ---------------------------------------------------
console.log("Propagation:");
{
  const server = new FakeServer();
  const a = new Device(server);
  const b = new Device(server);
  a.snap.exercises.push(exercise("x1", "Pull-ups", 100));
  a.snap.checkIns.push(checkIn("2026-02-01", 5, 100));
  const r1 = await a.sync();
  assert(r1.pushed === 2, "A pushes its 2 new records");
  await b.sync();
  assert(b.snap.exercises.length === 1 && b.snap.exercises[0].name === "Pull-ups", "B receives A's exercise");
  assert(b.snap.checkIns[0]?.points === 5, "B receives A's check-in");
  const r2 = await a.sync();
  assert(r2.pushed === 0, "second sync with no changes pushes nothing");
  const r3 = await b.sync();
  assert(r3.pushed === 0, "B does not echo pulled records back");
}

// ---- 2. conflicts: last write wins -------------------------------------------
console.log("Conflicts:");
{
  const server = new FakeServer();
  const a = new Device(server);
  const b = new Device(server);
  a.snap.checkIns.push(checkIn("2026-02-01", 1, 100));
  await a.sync();
  await b.sync();
  // both edit the same day offline; B's edit is newer
  a.snap.checkIns[0] = checkIn("2026-02-01", 3, 200);
  b.snap.checkIns[0] = checkIn("2026-02-01", 5, 300);
  await a.sync();
  await b.sync();
  await a.sync();
  assert(a.snap.checkIns[0].points === 5, "A converges on the newer edit (B's)");
  assert(b.snap.checkIns[0].points === 5, "B keeps its newer edit");
  assert(a.snap.checkIns.length === 1, "no duplicate check-in for the date");
}
{
  const server = new FakeServer();
  const a = new Device(server);
  a.snap.checkIns.push(checkIn("2026-02-01", 5, 500));
  await a.sync();
  // a stale device pushes an older edit straight at the server
  await server.backend().push([
    { kind: "check_in", id: "ci-2026-02-01", data: checkIn("2026-02-01", -3, 100), updated_at: 100, deleted_at: null },
  ]);
  const stored = server.rows.get(keyOf("check_in", "ci-2026-02-01"))!;
  assert(stored.updated_at === 500, "server trigger rejects a stale write");
}

// ---- 3. auto-created workouts never clobber real data ---------------------------
console.log("Auto-created workouts:");
{
  const server = new FakeServer();
  const a = new Device(server);
  const b = new Device(server);
  a.snap.workouts.push(workout("2026-02-02", 1000, 3)); // genuinely logged on A
  await a.sync();
  // B opens the day before its first pull finishes: empty, updatedAt 0
  b.snap.workouts.push(workout("2026-02-02", 0, 0));
  const rb = await b.sync();
  assert(b.snap.workouts[0].exercises.length === 3, "A's real workout replaces B's empty auto-created one");
  assert(rb.pushed === 0, "an untouched (updatedAt 0) workout is not uploaded");
  const c = new Device(server);
  c.snap.workouts.push(workout("2026-02-09", 0, 0));
  const rc = await c.sync();
  assert(rc.pushed === 0 && !server.rows.has(keyOf("workout", "wo-2026-02-09")), "empty visited day never reaches the server");
}

// ---- 4. edits made during an in-flight sync are not lost ---------------------------
console.log("In-flight edits:");
{
  const server = new FakeServer();
  const a = new Device(server);
  const b = new Device(server);
  a.snap.exercises.push(exercise("x1", "Pull-ups", 100));
  await a.sync();
  await b.sync(() => {
    b.snap.exercises.push(exercise("x2", "Plank", 400)); // typed while pulling
  });
  assert(b.snap.exercises.length === 2, "local edit survives the merge of pulled rows");
  assert(server.rows.has(keyOf("exercise", "x2")), "…and is pushed in the same cycle");
}

// ---- 5. tombstones ----------------------------------------------------------------------
console.log("Deletes:");
{
  const server = new FakeServer();
  const a = new Device(server);
  const b = new Device(server);
  a.snap.exercises.push(exercise("x1", "Pull-ups", 100));
  await a.sync();
  await b.sync();
  a.snap.exercises[0] = { ...a.snap.exercises[0], deletedAt: 500, updatedAt: 500 };
  await a.sync();
  await b.sync();
  assert(b.snap.exercises[0].deletedAt === 500, "soft-delete propagates to the other device");
}

// ---- 6. scope: settings are never synced ----------------------------------------------------
console.log("Scope:");
{
  const s = emptySnapshot();
  s.settings = { ...s.settings, anthropicApiKey: "sk-ant-secret", openaiApiKey: "sk-secret" };
  s.exercises.push(exercise("x1", "Pull-ups", 100));
  const blob = JSON.stringify(snapshotToRows(s));
  assert(!blob.includes("sk-ant-secret") && !blob.includes("sk-secret"), "API keys never appear in synced rows");
}

// ---- 7. legacy id normalization ----------------------------------------------------------------
console.log("Normalization:");
{
  const s = emptySnapshot();
  s.checkIns.push(
    { ...checkIn("2026-03-01", 2, 100), id: "random-1" },
    { ...checkIn("2026-03-01", 4, 200), id: "random-2" },
  );
  s.workouts.push({ ...workout("2026-03-01", 50, 1), id: "uuid-w" });
  const n = normalizeSnapshot(s);
  assert(n.checkIns.length === 1 && n.checkIns[0].id === "ci-2026-03-01", "legacy check-ins re-keyed to ci-<date>");
  assert(n.checkIns[0].points === 4, "newest duplicate for the date wins");
  assert(n.workouts[0].id === "wo-2026-03-01", "legacy workout re-keyed to wo-<date>");
}

// ---- 8. account-saved API keys (opt-in) ----------------------------------------------------------
console.log("Saved API keys:");
{
  let serverRow: SettingsRow | null = null;
  const settingsServer: SettingsBackend = {
    pullSettings: async () => (serverRow ? structuredClone(serverRow) : null),
    pushSettings: async (row) => {
      if (serverRow && row.updated_at <= serverRow.updated_at) return; // trigger: skip stale
      serverRow = structuredClone(row);
    },
  };
  const base = emptySnapshot().settings;
  const sync = async (local: Settings): Promise<Settings> => {
    const remote = await settingsServer.pullSettings();
    const { apply, push } = reconcileSettings(local, remote);
    if (push) await settingsServer.pushSettings(push);
    return apply ?? local;
  };

  // Device that never opted in uploads nothing.
  let lone: Settings = { ...base, anthropicApiKey: "sk-ant-LONE", settingsUpdatedAt: 50 };
  lone = await sync(lone);
  assert(serverRow === null, "nothing is uploaded unless saving is turned on");

  // A turns saving on.
  let a: Settings = { ...base, anthropicApiKey: "sk-ant-AAA", syncApiKeys: true, settingsUpdatedAt: 100 };
  a = await sync(a);
  assert(serverRow?.enabled === true && serverRow.data.anthropicApiKey === "sk-ant-AAA", "turning it on uploads the key");
  assert(!("syncApiKeys" in (serverRow?.data ?? {})), "the on/off flag itself is not part of the saved data");

  // B is a fresh device that already typed its own key locally (newer than A's).
  let b: Settings = { ...base, openaiApiKey: "sk-BBB-local", settingsUpdatedAt: 200 };
  b = await sync(b);
  assert(b.anthropicApiKey === "sk-ant-AAA" && b.syncApiKeys === true, "a new device joins with the account's keys");
  assert(b.openaiApiKey === undefined, "…replacing its own local-only key rather than mixing");
  assert(serverRow?.data.anthropicApiKey === "sk-ant-AAA", "a new device never overwrites the account's keys");

  // A changes its key; B picks it up.
  a = { ...a, anthropicApiKey: "sk-ant-AAA2", settingsUpdatedAt: 300 };
  a = await sync(a);
  b = await sync(b);
  assert(b.anthropicApiKey === "sk-ant-AAA2", "a key change on one device reaches the other");

  // A removes the key entirely; the removal propagates.
  a = { ...a, anthropicApiKey: undefined, settingsUpdatedAt: 400 };
  a = await sync(a);
  b = await sync(b);
  assert(b.anthropicApiKey === undefined, "removing a key on one device removes it on the other");

  // Stale write from B is rejected.
  await settingsServer.pushSettings({ enabled: true, data: { anthropicApiKey: "sk-ant-OLD" }, updated_at: 250 });
  assert(serverRow?.data.anthropicApiKey === undefined, "server rejects an older settings write");

  // B turns saving off: keys leave the server; A stops syncing but keeps its local keys.
  a = { ...a, openaiApiKey: "sk-AAA-oa", settingsUpdatedAt: 500 };
  a = await sync(a);
  b = await sync(b);
  b = { ...b, syncApiKeys: false, settingsUpdatedAt: 600 };
  b = await sync(b);
  assert(serverRow?.enabled === false && Object.keys(serverRow.data).length === 0, "turning it off removes keys from the server");
  a = await sync(a);
  assert(a.syncApiKeys === false && a.openaiApiKey === "sk-AAA-oa", "other devices switch off but keep their local keys");
  a = { ...a, openaiApiKey: "sk-AAA-new", settingsUpdatedAt: 700 };
  a = await sync(a);
  assert(serverRow?.enabled === false && !serverRow.data.openaiApiKey, "edits while off are not uploaded");
}

console.log(failures === 0 ? "\nSYNC OK ✅" : `\n${failures} FAILURES ❌`);
if (failures) process.exit(1);
