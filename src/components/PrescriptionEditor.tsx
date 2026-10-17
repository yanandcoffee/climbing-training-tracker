import type { MeasureType, Prescription, WorkoutExercise } from "../types";
import { MEASURE_LABELS, MEASURE_ORDER } from "../types";
import { LoadPicker } from "./LoadInput";

const inputCls =
  "mt-0.5 w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));

/** Edits this workout's target for one exercise (sets/reps/time/load). */
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
          {MEASURE_ORDER.map((m) => (
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
          {t === "intervals" && field("On (sec)", "holdSec")}
          {t === "intervals" && field("Off (sec)", "restSec")}
          {t === "intervals" && field("Reps per set", "reps")}
          {t === "duration" && field("Duration (sec)", "holdSec")}
        </div>
      )}
      {t === "intervals" && (
        <p className="text-[11px] text-slate-400">
          e.g. 7 on / 3 off for 5 sets. Leave reps per set blank unless each set repeats the on/off (repeaters).
        </p>
      )}
      {t !== "check" && (
        <LoadPicker id={item.id} weight={p.weight} unit={p.weightUnit ?? "lb"} onChange={setP} />
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
