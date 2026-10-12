import type { MeasureType, Prescription, WeightUnit, WorkoutExercise } from "../types";
import { MEASURE_LABELS } from "../types";

const MEASURES: MeasureType[] = ["reps", "hold", "reps_in_time", "duration", "check"];

const inputCls =
  "mt-0.5 w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));

/** Edits this workout's target for one exercise (sets/reps/time/weight). */
export default function PrescriptionEditor({
  item,
  onChange,
}: {
  item: WorkoutExercise;
  onChange: (patch: Partial<WorkoutExercise>) => void;
}) {
  const p = item.prescription ?? {};
  const setP = (patch: Partial<Prescription>) =>
    onChange({ prescription: { ...p, ...patch } });

  const field = (label: string, key: keyof Prescription, step = "1") => (
    <label className="flex flex-col text-[11px] text-slate-500">
      {label}
      <input
        // Remount when the stored value changes elsewhere (e.g. sync), so defaultValue stays current.
        key={`${item.id}-${key}-${p[key] ?? ""}`}
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        defaultValue={(p[key] as number | undefined) ?? ""}
        onBlur={(e) => {
          const v = num(e.target.value);
          if (v !== p[key]) setP({ [key]: v } as Partial<Prescription>);
        }}
        className={inputCls}
      />
    </label>
  );

  const unit: WeightUnit = p.weightUnit ?? "lb";
  const t = item.measureType;

  return (
    <div className="space-y-2">
      <label className="flex flex-col text-[11px] text-slate-500">
        Type
        <select
          value={t}
          onChange={(e) => onChange({ measureType: e.target.value as MeasureType })}
          className="mt-0.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          {MEASURES.map((m) => (
            <option key={m} value={m}>
              {MEASURE_LABELS[m]}
            </option>
          ))}
        </select>
      </label>

      {t !== "check" && (
        <div className="flex flex-wrap items-end gap-3">
          {field("Sets", "sets")}
          {t === "reps" && field("Reps", "reps")}
          {t === "reps_in_time" && field("Window (sec)", "windowSec")}
          {t === "hold" && field("Hold (sec)", "holdSec")}
          {t === "duration" && field("Duration (sec)", "holdSec")}
          {t !== "reps_in_time" && (
            <div className="flex items-end gap-1">
              {field(`Weight`, "weight", "0.25")}
              <div className="flex overflow-hidden rounded-lg border border-slate-200 text-xs dark:border-slate-700">
                {(["lb", "kg"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setP({ weightUnit: u })}
                    aria-pressed={unit === u}
                    className={`px-2 py-1.5 ${
                      unit === u
                        ? "bg-sky-600 text-white"
                        : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <label className="flex flex-col text-[11px] text-slate-500">
        Notes for this workout
        <input
          key={`${item.id}-notes-${item.notes ?? ""}`}
          defaultValue={item.notes ?? ""}
          placeholder="e.g. full crimp, on 10mm"
          onBlur={(e) => {
            const v = e.target.value.trim() || undefined;
            if (v !== item.notes) onChange({ notes: v });
          }}
          className="mt-0.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
    </div>
  );
}
