import { create } from "zustand";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useStore } from "../store/useStore";
import { emptySyncState, syncCycle, type SyncState } from "./engine";
import { createSupabaseBackend } from "./supabaseBackend";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const syncConfigured = Boolean(URL && KEY);

const STATE_KEY = "ctt.sync.v1";
const DEBOUNCE_MS = 2000;

export type SyncStatus =
  | "unconfigured"
  | "signed_out"
  | "idle"
  | "syncing"
  | "error";

interface SyncUI {
  status: SyncStatus;
  email: string | null;
  lastSyncedAt: number | null;
  error: string | null;
  codeSentTo: string | null;
  init: () => Promise<void>;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

// The Supabase client is loaded lazily so it stays out of the initial bundle
// (and out of the app entirely when sync isn't configured).
let clientPromise: Promise<SupabaseClient> | null = null;
function getClient(): Promise<SupabaseClient> {
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(URL!, KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // We sign in with an emailed code, not a redirect link.
        detectSessionInUrl: false,
      },
    }),
  );
  return clientPromise;
}

function loadState(): SyncState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw) as SyncState;
  } catch {
    /* fall through */
  }
  return emptySyncState();
}
const saveState = (s: SyncState) =>
  localStorage.setItem(STATE_KEY, JSON.stringify(s));

const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String((e as { message: unknown }).message)
      : "Something went wrong.";

let running = false;
let rerun = false;
let inited = false;

export const useSync = create<SyncUI>((set, get) => ({
  status: syncConfigured ? "signed_out" : "unconfigured",
  email: null,
  lastSyncedAt: null,
  error: null,
  codeSentTo: null,

  init: async () => {
    if (inited || !syncConfigured) return;
    inited = true;
    const client = await getClient();

    client.auth.onAuthStateChange((event, session) => {
      if (session) {
        set({ email: session.user.email ?? null });
        if (event === "SIGNED_IN") void get().syncNow();
      } else {
        set({ status: "signed_out", email: null });
      }
    });

    // Sync after local edits to synced data (debounced), not on every store tick.
    let timer: ReturnType<typeof setTimeout> | undefined;
    useStore.subscribe((s, prev) => {
      const changed =
        s.checkIns !== prev.checkIns ||
        s.exercises !== prev.exercises ||
        s.workouts !== prev.workouts ||
        s.templates !== prev.templates ||
        s.schedule !== prev.schedule;
      if (!changed || get().status === "signed_out") return;
      clearTimeout(timer);
      timer = setTimeout(() => void get().syncNow(), DEBOUNCE_MS);
    });

    // Catch up when the app regains focus or the network returns.
    window.addEventListener("online", () => void get().syncNow());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void get().syncNow();
    });

    const { data } = await client.auth.getSession();
    if (data.session) {
      set({ status: "idle", email: data.session.user.email ?? null });
      void get().syncNow();
    }
  },

  sendCode: async (email) => {
    set({ error: null });
    const client = await getClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) {
      set({ error: message(error) });
      throw error;
    }
    set({ codeSentTo: email });
  },

  verifyCode: async (email, code) => {
    set({ error: null });
    const client = await getClient();
    const { error } = await client.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (error) {
      set({ error: message(error) });
      throw error;
    }
    set({ codeSentTo: null, status: "idle" });
  },

  signInWithPassword: async (email, password) => {
    set({ error: null });
    const client = await getClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      set({ error: message(error) });
      throw error;
    }
    set({ status: "idle" });
  },

  signUpWithPassword: async (email, password) => {
    set({ error: null });
    const client = await getClient();
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) {
      set({ error: message(error) });
      throw error;
    }
    if (!data.session) {
      // Project still has "Confirm email" on: the account exists but can't sign in yet.
      const msg =
        "Account created, but Supabase is set to require email confirmation. " +
        "Turn off “Confirm email” (Authentication → Sign In / Providers → Email), then sign in.";
      set({ error: msg });
      throw new Error(msg);
    }
    set({ status: "idle" });
  },

  signOut: async () => {
    const client = await getClient();
    await client.auth.signOut();
    set({ status: "signed_out", email: null, codeSentTo: null, error: null });
  },

  syncNow: async () => {
    if (!syncConfigured) return;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      const client = await getClient();
      const { data } = await client.auth.getSession();
      const session = data.session;
      if (!session) {
        set({ status: "signed_out" });
        return;
      }
      set({ status: "syncing", error: null });

      let state = loadState();
      if (state.userId !== session.user.id) state = emptySyncState(session.user.id);

      const result = await syncCycle({
        backend: createSupabaseBackend(client, session.user.id),
        state,
        getSnapshot: () => useStore.getState().exportSnapshot(),
        applyRows: (rows) => useStore.getState().applyRemote(rows),
      });
      saveState(result.state);
      set({ status: "idle", lastSyncedAt: Date.now() });
    } catch (e) {
      set({ status: "error", error: message(e) });
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        void get().syncNow();
      }
    }
  },
}));
