import type { Snapshot, Synced } from "../types";

/**
 * The persistence seam. The store depends only on this interface, so a future
 * cloud backend (e.g. a Supabase-backed RemoteStorageAdapter) can drop in
 * without touching screens or the store. pull()/push() are optional and only
 * implemented by sync-capable adapters.
 */
export interface StorageAdapter {
  load(): Promise<Snapshot | null>;
  save(snapshot: Snapshot): Promise<void>;
  pull?(): Promise<Snapshot | null>;
  push?(snapshot: Snapshot): Promise<void>;
}

export const SNAPSHOT_VERSION = 1;

/**
 * Check-ins and workouts are keyed by date (`ci-<date>` / `wo-<date>`) so that
 * two devices edit the same record instead of creating duplicates. Data saved
 * before that scheme used random ids: re-key it, keeping the newest per date.
 */
export function normalizeSnapshot(s: Snapshot): Snapshot {
  const rekey = <T extends Synced & { date: string }>(list: T[], prefix: string): T[] => {
    const best = new Map<string, T>();
    for (const r of list) {
      if (r.deletedAt) continue;
      const cur = best.get(r.date);
      if (!cur || r.updatedAt >= cur.updatedAt) best.set(r.date, r);
    }
    const active = [...best.values()].map((r) => ({ ...r, id: `${prefix}${r.date}` }));
    return [...list.filter((r) => r.deletedAt), ...active];
  };
  return {
    ...s,
    checkIns: rekey(s.checkIns, "ci-"),
    workouts: rekey(s.workouts, "wo-"),
  };
}

export function emptySnapshot(): Snapshot {
  return {
    version: SNAPSHOT_VERSION,
    checkIns: [],
    exercises: [],
    workouts: [],
    templates: [],
    schedule: [],
    settings: {
      provider: "anthropic",
      anthropicModel: "claude-opus-4-8",
      openaiModel: "gpt-4.1",
    },
  };
}
