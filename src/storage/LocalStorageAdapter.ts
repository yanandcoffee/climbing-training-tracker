import type { Snapshot } from "../types";
import { emptySnapshot, SNAPSHOT_VERSION, type StorageAdapter } from "./StorageAdapter";

const KEY = "ctt.snapshot.v1";

/** The only adapter shipped today. Screens/store never touch localStorage directly. */
export class LocalStorageAdapter implements StorageAdapter {
  async load(): Promise<Snapshot | null> {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Snapshot;
      return migrate(parsed);
    } catch {
      return null;
    }
  }

  async save(snapshot: Snapshot): Promise<void> {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  }
}

function migrate(s: Partial<Snapshot>): Snapshot {
  const base = emptySnapshot();
  return {
    ...base,
    ...s,
    version: SNAPSHOT_VERSION,
    settings: { ...base.settings, ...(s.settings ?? {}) },
  };
}
