import { useMemo, useState } from "react";
import type { Exercise } from "../types";
import { CATEGORY_LABELS } from "../types";
import { useActiveExercises, useActiveWorkouts, useStore } from "../store/useStore";
import { parseNotes, type ParsedItem, type ParsedPlan } from "../lib/parseNotes";
import { PROVIDER_ORDER, PROVIDERS, apiKeyFor, providerOf } from "../lib/providers";
import { isEmptyWorkout, prescriptionSummary } from "../lib/workoutPlan";
import { defaultMapping, itemKey, NEW_EXERCISE as NEW, planToBody } from "../lib/importPlan";
import { shortDate } from "../lib/dates";
import MultiDatePicker from "./MultiDatePicker";

export default function ImportNotesDialog({
  initialDate,
  onClose,
}: {
  initialDate: string;
  onClose: () => void;
}) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const addExercise = useStore((s) => s.addExercise);
  const applyWorkoutToDates = useStore((s) => s.applyWorkoutToDates);
  const library = useActiveExercises();
  const workouts = useActiveWorkouts();

  const provider = providerOf(settings);
  const hasKey = !!apiKeyFor(settings, provider);

  const [text, setText] = useState("");
  const [status, setStatus] = useState<"input" | "loading" | "review">("input");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [name, setName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [dates, setDates] = useState<string[]>([initialDate]);
  const [mode, setMode] = useState<"replace" | "append">("replace");

  const workoutDates = useMemo(
    () => new Set(workouts.filter((w) => !isEmptyWorkout(w)).map((w) => w.date)),
    [workouts],
  );
  const conflicts = dates.filter((d) => workoutDates.has(d));

  const run = async () => {
    setError(null);
    setStatus("loading");
    try {
      const result = await parseNotes(text, settings, library.map((e) => e.name));
      setPlan(result);
      setName(result.workoutName);
      setMapping(defaultMapping(result, library));
      setRemoved(new Set());
      setStatus("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse.");
      setStatus("input");
    }
  };

  const save = () => {
    if (!plan || !dates.length) return;
    const body = planToBody(plan, {
      name,
      mapping,
      removed,
      library,
      createExercise: (data) => addExercise(data),
    });
    applyWorkoutToDates(body, dates, mode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-4 dark:bg-slate-900 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Import coach's note</h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-400">
            Close
          </button>
        </div>

        {status !== "review" && (
          <>
            <div className="mb-3 flex gap-2" role="radiogroup" aria-label="AI provider">
              {PROVIDER_ORDER.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={settings.provider === p}
                  onClick={() => setSettings({ provider: p })}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${
                    settings.provider === p
                      ? "bg-sky-600 text-white"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  }`}
                >
                  {PROVIDERS[p].name}
                </button>
              ))}
            </div>
            {!hasKey && (
              <p className="mb-3 rounded-lg bg-amber-100 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                No {provider.company} API key set. Add one in Settings (or switch provider), or
                build the workout by hand.
              </p>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              placeholder="Paste your coach's note here…"
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
            />
            {error && (
              <p className="mt-2 rounded-lg bg-red-100 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={run}
              disabled={status === "loading" || !text.trim() || !hasKey}
              className="mt-3 w-full rounded-xl bg-sky-600 px-4 py-2.5 font-medium text-white disabled:opacity-40"
            >
              {status === "loading" ? "Reading note…" : `Read with ${provider.name}`}
            </button>
          </>
        )}

        {status === "review" && plan && (
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-slate-400">Workout name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium dark:border-slate-700 dark:bg-slate-800"
              />
            </label>

            {plan.sections.map((sec, si) => (
              <div key={si}>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {sec.title}
                </h3>
                {sec.notes.length > 0 && (
                  <ul className="mb-2 space-y-0.5 rounded-lg bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    {sec.notes.map((n, i) => (
                      <li key={i}>💡 {n}</li>
                    ))}
                  </ul>
                )}
                <ul className="space-y-1.5">
                  {sec.items.map((it, ii) => {
                    const k = itemKey(si, ii);
                    if (removed.has(k)) return null;
                    const showGroup = it.group && it.group !== sec.items[ii - 1]?.group;
                    return (
                      <li key={k}>
                        {showGroup && (
                          <p className="mt-2 mb-1 text-[11px] font-semibold text-slate-500">
                            {it.group}
                          </p>
                        )}
                        <ReviewRow
                          item={it}
                          library={library}
                          value={mapping[k] ?? NEW}
                          onMap={(v) => setMapping((m) => ({ ...m, [k]: v }))}
                          onRemove={() => setRemoved((r) => new Set(r).add(k))}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="mb-2 text-sm font-medium">
                Which days? <span className="font-normal text-slate-400">Tap to select one or more.</span>
              </p>
              <MultiDatePicker selected={dates} onChange={setDates} markedDates={workoutDates} />
              {conflicts.length > 0 && (
                <div className="mt-3 rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800">
                  <p className="mb-1.5">
                    {conflicts.map(shortDate).join(", ")}{" "}
                    {conflicts.length === 1 ? "already has" : "already have"} a workout:
                  </p>
                  <div className="flex gap-2" role="radiogroup" aria-label="Existing workout">
                    {(["replace", "append"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={mode === m}
                        onClick={() => setMode(m)}
                        className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium ${
                          mode === m
                            ? "bg-sky-600 text-white"
                            : "bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        }`}
                      >
                        {m === "replace" ? "Replace it" : "Add to it"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={save}
                disabled={!dates.length}
                className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 font-medium text-white disabled:opacity-40"
              >
                {dates.length === 1
                  ? `Add to ${shortDate(dates[0])}`
                  : `Add to ${dates.length} days`}
              </button>
              <button
                type="button"
                onClick={() => setStatus("input")}
                className="rounded-xl bg-slate-200 px-4 py-2.5 font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200"
              >
                Back
              </button>
            </div>
            <p className="text-center text-[11px] text-slate-400">
              Exercises marked “new” are added to your library. Matched ones keep their history.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewRow({
  item,
  library,
  value,
  onMap,
  onRemove,
}: {
  item: ParsedItem;
  library: Exercise[];
  value: string;
  onMap: (v: string) => void;
  onRemove: () => void;
}) {
  const summary = prescriptionSummary(item.measureType, item);
  return (
    <div className="rounded-xl border border-slate-200 p-2.5 dark:border-slate-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{item.name}</p>
          <p className="text-xs text-slate-500">
            {summary || "No target"}
            {item.notes ? ` · ${item.notes}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-xs text-slate-400 hover:text-red-500"
          aria-label={`Skip ${item.name}`}
        >
          Skip
        </button>
      </div>
      <select
        value={value}
        onChange={(e) => onMap(e.target.value)}
        className={`mt-1.5 w-full rounded-lg border px-2 py-1 text-xs ${
          value === NEW
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
            : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
        }`}
        aria-label={`Match ${item.name} to an exercise`}
      >
        <option value={NEW}>New exercise · {CATEGORY_LABELS[item.category]}</option>
        {library.map((e) => (
          <option key={e.id} value={e.id}>
            Same as: {e.name}
          </option>
        ))}
      </select>
    </div>
  );
}
