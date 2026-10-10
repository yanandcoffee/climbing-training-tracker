import type { Snapshot } from "../types";

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
