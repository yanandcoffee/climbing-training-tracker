import { useState } from "react";
import type { Exercise, TemplateExercise } from "../types";
import { CATEGORY_LABELS, MEASURE_LABELS } from "../types";
import { useActiveExercises, useStore } from "../store/useStore";
import { parseNotes, type ParsedWorkout, type ParsedExercise } from "../lib/parseNotes";
import { uid } from "../lib/id";

export default function ImportNotesDialog({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const library = useActiveExercises();
  const addExercise = useStore((s) => s.addExercise);
  const addTemplate = useStore((s) => s.addTemplate);

  const hasKey =
    settings.provider === "openai"
      ? !!settings.openaiApiKey
      : !!settings.anthropicApiKey;
  const providerLabel = settings.provider === "openai" ? "OpenAI" : "Anthropic";

  const [text, setText] = useState("");
  const [status, setStatus] = useState<"input" | "loading" | "review">("input");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedWorkout | null>(null);

  const run = async () => {
    setError(null);
    setStatus("loading");
    try {
      const result = await parseNotes(text, settings);
      setParsed(result);
      setStatus("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse.");
      setStatus("input");
    }
  };

  const save = () => {
    if (!parsed) return;
    const byName = new Map(
      library.map((e) => [e.name.trim().toLowerCase(), e]),
    );
    const templateExercises: TemplateExercise[] = parsed.exercises.map((pe) => {
      let lib: Exercise | undefined = byName.get(pe.name.trim().toLowerCase());
      if (!lib) {
        lib = addExercise({
          name: pe.name,
          category: pe.category,
          measureType: pe.measureType,
          description: pe.notes,
          defaultSets: pe.sets,
          defaultReps: pe.reps,
          defaultWindowSec: pe.windowSec,
          defaultHoldSec: pe.holdSec,
        });
        byName.set(pe.name.trim().toLowerCase(), lib);
      }
      return {
        id: uid(),
        exerciseId: lib.id,
        name: pe.name,
        category: pe.category,
        measureType: pe.measureType,
        prescription: {
          sets: pe.sets,
          reps: pe.reps,
          windowSec: pe.windowSec,
          holdSec: pe.holdSec,
        },
        notes: pe.notes,
      };
    });
    addTemplate(parsed.workoutName, templateExercises);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-4 dark:bg-slate-900 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Import from Notes</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-400"
          >
            Close
          </button>
        </div>

        {!hasKey && (
          <p className="mb-3 rounded-lg bg-amber-100 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            No {providerLabel} API key set. Add one in Settings (or switch
            provider) to use AI parsing, or enter exercises manually.
          </p>
        )}

        {status !== "review" && (
          <>
            <div className="mb-3 flex gap-2" role="radiogroup" aria-label="AI provider">
              {(["anthropic", "openai"] as const).map((p) => (
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
                  {p === "anthropic" ? "Claude" : "ChatGPT"}
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder="Paste your coach's note here…"
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800"
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
              {status === "loading" ? "Parsing…" : `Parse with ${providerLabel}`}
            </button>
          </>
        )}

        {status === "review" && parsed && (
          <ReviewList
            parsed={parsed}
            onBack={() => setStatus("input")}
            onSave={save}
          />
        )}
      </div>
    </div>
  );
}

function ReviewList({
  parsed,
  onBack,
  onSave,
}: {
  parsed: ParsedWorkout;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">
        Parsed workout
      </p>
      <h3 className="mb-3 text-base font-semibold">{parsed.workoutName}</h3>
      <ul className="space-y-2">
        {parsed.exercises.map((e, i) => (
          <ReviewRow key={i} e={e} />
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onSave}
          className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 font-medium text-white"
        >
          Save as template
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-slate-200 px-4 py-2.5 font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200"
        >
          Back
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        New exercises are added to your library; assign this template to a day on
        the Schedule screen.
      </p>
    </div>
  );
}

function summary(e: ParsedExercise): string {
  switch (e.measureType) {
    case "reps":
      return `${e.sets ?? "?"} × ${e.reps ?? "?"}`;
    case "reps_in_time":
      return `${e.sets ?? 1} × max reps / ${e.windowSec ?? "?"}s`;
    case "hold":
      return `${e.sets ?? 1} × ${e.holdSec ?? "?"}s hold`;
    case "duration":
      return `${e.holdSec ?? "?"}s`;
  }
}

function ReviewRow({ e }: { e: ParsedExercise }) {
  return (
    <li className="rounded-xl border border-slate-200 p-2.5 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <span className="font-medium">{e.name}</span>
        <span className="text-xs text-slate-500">{summary(e)}</span>
      </div>
      <p className="text-[11px] text-slate-400">
        {CATEGORY_LABELS[e.category]} · {MEASURE_LABELS[e.measureType]}
      </p>
    </li>
  );
}
