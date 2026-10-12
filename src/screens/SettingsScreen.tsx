import { useRef, useState } from "react";
import type { Snapshot } from "../types";
import { useStore } from "../store/useStore";
import CloudSyncSection from "../components/CloudSyncSection";
import { useSync } from "../sync/useSync";
import { PROVIDER_ORDER, PROVIDERS, modelFor, providerOf } from "../lib/providers";

export default function SettingsScreen() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const exportSnapshot = useStore((s) => s.exportSnapshot);
  const importSnapshot = useStore((s) => s.importSnapshot);
  const clearAll = useStore((s) => s.clearAll);

  const syncStatus = useSync((s) => s.status);
  const signedIn = syncStatus !== "unconfigured" && syncStatus !== "signed_out";

  // Draft key per provider; committed on blur.
  const storedKeyMap = () =>
    Object.fromEntries(PROVIDER_ORDER.map((p) => [p, settings[PROVIDERS[p].keyField] ?? ""]));
  const [keys, setKeys] = useState<Record<string, string>>(storedKeyMap);
  // Refresh the fields when keys change underneath us (e.g. pulled from the account).
  const storedKeys = PROVIDER_ORDER.map((p) => settings[PROVIDERS[p].keyField] ?? "").join("\n");
  const [seenKeys, setSeenKeys] = useState(storedKeys);
  if (storedKeys !== seenKeys) {
    setSeenKeys(storedKeys);
    setKeys(storedKeyMap());
  }
  const [showKey, setShowKey] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const provider = providerOf(settings);
  const keyVal = keys[provider.id] ?? "";
  const setKeyVal = (v: string) => setKeys((k) => ({ ...k, [provider.id]: v }));
  const commitKey = () => setSettings({ [provider.keyField]: keyVal.trim() || undefined });
  const models = provider.models;
  const modelVal = modelFor(settings, provider);
  const setModelVal = (m: string) => setSettings({ [provider.modelField]: m });

  const doExport = () => {
    const data = JSON.stringify(exportSnapshot(), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `break-your-plateau-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Snapshot;
      importSnapshot(parsed);
      setMsg("Data imported.");
    } catch {
      setMsg("Could not read that file.");
    }
  };

  const input =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";

  return (
    <div className="space-y-6 py-4">
      <h1 className="text-xl font-bold">Settings</h1>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          AI note parsing
        </h2>

        <label className="block text-sm">Provider</label>
        <div className="flex flex-wrap gap-2">
          {PROVIDER_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSettings({ provider: p })}
              className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium ${
                settings.provider === p
                  ? "bg-sky-600 text-white"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
              }`}
            >
              {PROVIDERS[p].label}
            </button>
          ))}
        </div>

        <label className="mt-2 block text-sm">
          {provider.company} API key
        </label>
        <div className="flex gap-2">
          <input
            type={showKey ? "text" : "password"}
            value={keyVal}
            onChange={(e) => setKeyVal(e.target.value)}
            onBlur={commitKey}
            placeholder={provider.keyPlaceholder}
            className={input}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="rounded-xl bg-slate-200 px-3 text-sm dark:bg-slate-700"
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
        <p className="text-[11px] text-slate-400">
          {settings.syncApiKeys
            ? "Saved in this browser and to your account."
            : "Stored only in this browser."}{" "}
          Used to call the {provider.company} API directly from your device.
          The app works fully without it (manual entry).
        </p>
        {provider.help && (
          <p className="rounded-lg bg-sky-50 p-2 text-[11px] text-sky-800 dark:bg-sky-950 dark:text-sky-200">
            {provider.help}
          </p>
        )}

        {signedIn ? (
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <input
              type="checkbox"
              checked={settings.syncApiKeys === true}
              onChange={(e) => setSettings({ syncApiKeys: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-sky-600"
            />
            <span className="text-sm">
              Save API keys to my account
              <span className="mt-0.5 block text-[11px] text-slate-400">
                Syncs your provider, models and keys to your other devices. Keys
                are stored in your Supabase project, readable only when signed in
                as you. Turning this off removes them from the server.
              </span>
            </span>
          </label>
        ) : (
          syncStatus === "signed_out" && (
            <p className="text-[11px] text-slate-400">
              Sign in under Cloud sync to save your keys to your account.
            </p>
          )
        )}

        <label className="mt-2 block text-sm">Model</label>
        <select
          value={modelVal}
          onChange={(e) => setModelVal(e.target.value)}
          className={input}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </section>

      <CloudSyncSection />

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Your data
        </h2>
        <p className="text-[11px] text-slate-400">
          Everything is stored on this device (and in your account, if Cloud
          sync is on). Export a JSON backup to keep a copy or move data
          without sync.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={doExport}
            className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex-1 rounded-xl bg-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200"
          >
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = "";
            }}
          />
        </div>
        {msg && <p className="text-sm text-sky-600 dark:text-sky-400">{msg}</p>}
        <button
          type="button"
          onClick={() => {
            if (confirm("Delete ALL data on this device? This cannot be undone.")) {
              clearAll();
              setKeys({});
              setMsg("All data cleared.");
            }
          }}
          className="mt-1 w-full rounded-xl bg-red-100 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          Clear all data
        </button>
      </section>

      <p className="pt-2 text-center text-[11px] text-slate-400">
        © 2026 Break Your Plateau
      </p>
    </div>
  );
}
