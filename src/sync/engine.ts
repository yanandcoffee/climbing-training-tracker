import type { Snapshot, Synced } from "../types";

// Pure sync logic: no network, no store. The backend and the store are injected,
// which keeps this testable with simulated devices.

export type Kind = "check_in" | "exercise" | "workout" | "template" | "schedule";

export interface Row {
  kind: Kind;
  id: string;
  data: unknown;
  updated_at: number; // epoch ms — last-write-wins key
  deleted_at: number | null;
  synced_at?: string; // server timestamp, present on pulled rows
}

type SyncedField = "checkIns" | "exercises" | "workouts" | "templates" | "schedule";

const KIND_FIELD: Record<Kind, SyncedField> = {
  check_in: "checkIns",
  exercise: "exercises",
  workout: "workouts",
  template: "templates",
  schedule: "schedule",
};
const KINDS = Object.keys(KIND_FIELD) as Kind[];

export const keyOf = (kind: Kind, id: string) => `${kind}:${id}`;

/** Every synced record in the snapshot, as rows. Settings are never synced. */
export function snapshotToRows(s: Snapshot): Row[] {
  const rows: Row[] = [];
  for (const kind of KINDS) {
    for (const rec of s[KIND_FIELD[kind]] as Synced[]) {
      rows.push({
        kind,
        id: rec.id,
        data: rec,
        updated_at: rec.updatedAt,
        deleted_at: rec.deletedAt ?? null,
      });
    }
  }
  return rows;
}

/** Merge pulled rows into a snapshot: the newer `updatedAt` wins, ties keep local. */
export function mergeRows(
  s: Snapshot,
  rows: Row[],
): { snapshot: Snapshot; changed: boolean } {
  const next: Snapshot = { ...s };
  let changed = false;

  for (const kind of KINDS) {
    const incoming = rows.filter((r) => r.kind === kind);
    if (!incoming.length) continue;

    const field = KIND_FIELD[kind];
    const list = [...(s[field] as Synced[])];
    const index = new Map(list.map((r, i) => [r.id, i]));
    let dirty = false;

    for (const row of incoming) {
      const rec = {
        ...(row.data as object),
        id: row.id,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at ?? undefined,
      } as Synced;
      const i = index.get(row.id);
      if (i === undefined) {
        index.set(row.id, list.length);
        list.push(rec);
        dirty = true;
      } else if (row.updated_at > list[i].updatedAt) {
        list[i] = rec;
        dirty = true;
      }
    }
    if (dirty) {
      (next as unknown as Record<string, unknown>)[field] = list;
      changed = true;
    }
  }
  return { snapshot: next, changed };
}

export interface SyncState {
  userId: string | null;
  /** Server `synced_at` high-water mark for incremental pulls. */
  lastPull: string | null;
  /** Per-record `updatedAt` last known to be on the server — what we skip pushing. */
  known: Record<string, number>;
}

export const emptySyncState = (userId: string | null = null): SyncState => ({
  userId,
  lastPull: null,
  known: {},
});

export interface RemoteBackend {
  pull(since: string | null): Promise<Row[]>;
  push(rows: Row[]): Promise<void>;
}

const PUSH_CHUNK = 500;

/**
 * One pull → merge → push cycle.
 *
 * `applyRows` merges pulled rows into the *live* store and `getSnapshot` reads
 * it *after* that, so edits made while the network request was in flight are
 * never clobbered.
 */
export async function syncCycle(opts: {
  backend: RemoteBackend;
  state: SyncState;
  getSnapshot: () => Snapshot;
  applyRows: (rows: Row[]) => void;
}): Promise<{ state: SyncState; pulled: number; pushed: number }> {
  const known = { ...opts.state.known };
  let lastPull = opts.state.lastPull;

  const pulled = await opts.backend.pull(lastPull);
  for (const r of pulled) {
    const k = keyOf(r.kind, r.id);
    known[k] = Math.max(known[k] ?? -1, r.updated_at);
    if (r.synced_at && (!lastPull || r.synced_at > lastPull)) lastPull = r.synced_at;
  }
  if (pulled.length) opts.applyRows(pulled);

  // Default `known` to 0, so never-edited records (updatedAt 0) aren't uploaded.
  const toPush = snapshotToRows(opts.getSnapshot()).filter(
    (r) => r.updated_at > (known[keyOf(r.kind, r.id)] ?? 0),
  );
  for (let i = 0; i < toPush.length; i += PUSH_CHUNK) {
    const chunk = toPush.slice(i, i + PUSH_CHUNK);
    await opts.backend.push(chunk);
    for (const r of chunk) known[keyOf(r.kind, r.id)] = r.updated_at;
  }

  return {
    state: { ...opts.state, lastPull, known },
    pulled: pulled.length,
    pushed: toPush.length,
  };
}
