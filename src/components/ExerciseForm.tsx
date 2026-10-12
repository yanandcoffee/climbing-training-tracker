import { useState } from "react";
import type { Exercise, ExerciseCategory, MeasureType } from "../types";
import { CATEGORY_LABELS, CATEGORY_ORDER, MEASURE_LABELS } from "../types";

const MEASURES: MeasureType[] = ["reps", "hold", "reps_in_time", "duration", "check"];

export type ExerciseDraft = Omit<Exercise, "id" | "updatedAt" | "deletedAt">;

export default function ExerciseForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<ExerciseDraft>;
  onSave: (draft: ExerciseDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<ExerciseCategory>(
    initial?.category ?? "on_wall_drills",
  );
  const [measureType, setMeasureType] = useState<MeasureType>(
    initial?.measureType ?? "reps",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [mediaUrl, setMediaUrl] = useState(initial?.mediaUrl ?? "");

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      category,
      measureType,
      description: description.trim() || undefined,
      mediaUrl: mediaUrl.trim() || undefined,
    });
  };

  const input =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Exercise name"
        className={input}
        autoFocus
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ExerciseCategory)}
          className={input}
        >
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select
          value={measureType}
          onChange={(e) => setMeasureType(e.target.value as MeasureType)}
          className={input}
        >
          {MEASURES.map((m) => (
            <option key={m} value={m}>
              {MEASURE_LABELS[m]}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[11px] text-slate-400">
        Sets, reps and weight are set per workout, so the same exercise can progress week to week.
        The measure type is just the default when you add it to a workout.
      </p>

      <input
        value={mediaUrl}
        onChange={(e) => setMediaUrl(e.target.value)}
        placeholder="Reference media URL (image or video / YouTube)"
        className={input}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Notes / cues (optional)"
        rows={2}
        className={`${input} resize-none`}
      />

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim()}
          className="flex-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
