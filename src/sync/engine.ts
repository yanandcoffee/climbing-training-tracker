import type { Settings, Snapshot, Synced } from "../types";

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

/** Whether records known to be on the server are absent from this device entirely. */
export function missingLocally(state: SyncState, snapshot: Snapshot): boolean {
  const local = new Set(snapshotToRows(snapshot).map((r) => keyOf(r.kind, r.id)));
  return Object.keys(state.known).some((k) => !local.has(k));
}

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
  // This device lost records the server has (e.g. its storage was wiped): an
  // incremental pull would never bring them back, so pull everything again.
  if (lastPull && missingLocally(opts.state, opts.getSnapshot())) lastPull = null;

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

// ---- Account-saved AI settings (opt-in) -------------------------------------

/** Settings fields saved to the account when "Save API keys to my account" is on. */
export const SYNCED_SETTING_KEYS = [
  "provider",
  "anthropicApiKey",
  "openaiApiKey",
  "geminiApiKey",
  "anthropicModel",
  "openaiModel",
  "geminiModel",
] as const;

export type SyncedSettings = Pick<Settings, (typeof SYNCED_SETTING_KEYS)[number]>;

/** The single per-user row. `enabled: false` is a tombstone with keys removed. */
export interface SettingsRow {
  enabled: boolean;
  data: Partial<SyncedSettings>;
  updated_at: number;
}

export interface SettingsBackend {
  pullSettings(): Promise<SettingsRow | null>;
  pushSettings(row: SettingsRow): Promise<void>;
}

export function pickSyncedSettings(s: Settings): Partial<SyncedSettings> {
  const out: Partial<SyncedSettings> = {};
  for (const k of SYNCED_SETTING_KEYS) {
    if (s[k] !== undefined) (out as Record<string, unknown>)[k] = s[k];
  }
  return out;
}

/**
 * Decide what to do with local vs account AI settings (last-write-wins).
 * Returns local settings to apply and/or a row to push; both may be null.
 */
export function reconcileSettings(
  local: Settings,
  remote: SettingsRow | null,
): { apply: Settings | null; push: SettingsRow | null } {
  const lu = local.settingsUpdatedAt ?? 0;

  // Adopt the account version when it's newer, or when the account has saving on
  // and this device hasn't chosen yet (a new device joins with the account's keys
  // rather than overwriting them with its own empty fields).
  const joining = !!remote?.enabled && local.syncApiKeys === undefined;
  if (remote && (remote.updated_at > lu || joining)) {
    const apply: Settings = remote.enabled
      ? {
          ...local,
          // Clear synced fields first so a key removed on another device is removed here too.
          anthropicApiKey: undefined,
          openaiApiKey: undefined,
          geminiApiKey: undefined,
          ...remote.data,
          syncApiKeys: true,
          settingsUpdatedAt: remote.updated_at,
        }
      : { ...local, syncApiKeys: false, settingsUpdatedAt: remote.updated_at };
    return { apply, push: null };
  }

  const remoteOlder = !remote || lu > remote.updated_at;

  // Saving is on here and the local version is newer: upload it.
  if (local.syncApiKeys === true && remoteOlder && lu > 0) {
    return {
      apply: null,
      push: { enabled: true, data: pickSyncedSettings(local), updated_at: lu },
    };
  }

  // Explicitly turned off here, more recently than the account copy: remove the keys from the server.
  if (local.syncApiKeys === false && remote?.enabled && remoteOlder) {
    return { apply: null, push: { enabled: false, data: {}, updated_at: lu } };
  }

  return { apply: null, push: null };
}
