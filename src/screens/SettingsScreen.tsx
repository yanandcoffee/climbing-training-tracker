import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { AIProvider, Snapshot } from "../types";
import { useStore } from "../store/useStore";

const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-8", label: "Opus 4.8 (most capable)" },
  { id: "claude-sonnet-5", label: "Sonnet 5 (balanced)" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (fast / cheap)" },
];
const OPENAI_MODELS = [
  { id: "gpt-4.1", label: "GPT-4.1 (capable)" },
  { id: "gpt-5", label: "GPT-5 (most capable)" },
  { id: "gpt-4o-mini", label: "GPT-4o mini (fast / cheap)" },
];

export default function SettingsScreen() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const exportSnapshot = useStore((s) => s.exportSnapshot);
  const importSnapshot = useStore((s) => s.importSnapshot);
  const clearAll = useStore((s) => s.clearAll);

  const [anthKey, setAnthKey] = useState(settings.anthropicApiKey ?? "");
  const [oaKey, setOaKey] = useState(settings.openaiApiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isOpenAI = settings.provider === "openai";
  const keyVal = isOpenAI ? oaKey : anthKey;
  const setKeyVal = isOpenAI ? setOaKey : setAnthKey;
  const commitKey = () =>
    setSettings(
      isOpenAI
        ? { openaiApiKey: oaKey.trim() || undefined }
        : { anthropicApiKey: anthKey.trim() || undefined },
    );
  const models = isOpenAI ? OPENAI_MODELS : ANTHROPIC_MODELS;
  const modelVal = isOpenAI ? settings.openaiModel : settings.anthropicModel;
  const setModelVal = (m: string) =>
    setSettings(isOpenAI ? { openaiModel: m } : { anthropicModel: m });

  const doExport = () => {
    const data = JSON.stringify(exportSnapshot(), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `climbing-tracker-backup.json`;
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
        <div className="flex gap-2">
          {(["anthropic", "openai"] as AIProvider[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSettings({ provider: p })}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium ${
                settings.provider === p
                  ? "bg-sky-600 text-white"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
              }`}
            >
              {p === "anthropic" ? "Claude (Anthropic)" : "ChatGPT (OpenAI)"}
            </button>
          ))}
        </div>

        <label className="mt-2 block text-sm">
          {isOpenAI ? "OpenAI API key" : "Anthropic API key"}
        </label>
        <div className="flex gap-2">
          <input
            type={showKey ? "text" : "password"}
            value={keyVal}
            onChange={(e) => setKeyVal(e.target.value)}
            onBlur={commitKey}
            placeholder={isOpenAI ? "sk-…" : "sk-ant-…"}
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
          Stored only in this browser. Used to call the{" "}
          {isOpenAI ? "OpenAI" : "Anthropic"} API directly from your device. The
          app works fully without it (manual entry).
        </p>

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

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Schedule
        </h2>
        <Link
          to="/schedule"
          className="block rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"
        >
          Manage workout templates & weekly schedule →
        </Link>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Your data
        </h2>
        <p className="text-[11px] text-slate-400">
          Everything is stored on this device. Export a backup to move it to
          another device. Cloud sync across devices is planned for a later
          version.
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
              setAnthKey("");
              setOaKey("");
              setMsg("All data cleared.");
            }
          }}
          className="mt-1 w-full rounded-xl bg-red-100 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          Clear all data
        </button>
      </section>

      <p className="pt-2 text-center text-[11px] text-slate-400">
        Climbing Training Tracker · local-first PWA
      </p>
    </div>
  );
}
