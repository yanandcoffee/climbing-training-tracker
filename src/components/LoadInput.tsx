import { useState } from "react";
import type { WeightUnit } from "../types";

// A load is one signed number: > 0 added weight, 0 bodyweight, < 0 assisted
// (harness + pulley counterweight). The iPhone number pad has no minus key, so
// the direction is picked separately and only the amount is typed.

export type LoadMode = "none" | "bodyweight" | "added" | "assisted";

export const loadModeOf = (w: number | undefined): LoadMode =>
  w == null ? "none" : w === 0 ? "bodyweight" : w > 0 ? "added" : "assisted";

const MODE_LABELS: Record<LoadMode, string> = {
  none: "No load",
  bodyweight: "Bodyweight",
  added: "Added weight",
  assisted: "Assisted (−)",
};

const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Math.abs(Number(v)));

const inputCls =
  "mt-0.5 w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

/** The target's load: kind (bodyweight / added / assisted), amount and unit. */
export function LoadPicker({
  id,
  weight,
  unit,
  onChange,
}: {
  id: string;
  weight: number | undefined;
  unit: WeightUnit;
  onChange: (patch: { weight?: number; weightUnit?: WeightUnit }) => void;
}) {
  // Remembered while the amount is still blank ("Added weight" picked, nothing typed yet).
  const [picked, setPicked] = useState<LoadMode | null>(null);
  const stored = loadModeOf(weight);
  const mode = stored === "none" && picked ? picked : stored;
  const amount = weight != null && weight !== 0 ? Math.abs(weight) : undefined;
  const sign = mode === "assisted" ? -1 : 1;

  const pickMode = (m: LoadMode) => {
    setPicked(m);
    if (m === "none") onChange({ weight: undefined });
    else if (m === "bodyweight") onChange({ weight: 0 });
    else onChange({ weight: amount != null ? (m === "assisted" ? -amount : amount) : undefined });
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-[11px] text-slate-500">
        Load
        <select
          value={mode}
          onChange={(e) => pickMode(e.target.value as LoadMode)}
          className="mt-0.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          {(Object.keys(MODE_LABELS) as LoadMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </label>
      {(mode === "added" || mode === "assisted") && (
        <>
          <label className="flex flex-col text-[11px] text-slate-500">
            {mode === "assisted" ? "Taken off" : "Amount"}
            <input
              key={`${id}-load-${weight ?? ""}`}
              type="number"
              inputMode="decimal"
              step="0.25"
              min={0}
              defaultValue={amount ?? ""}
              onBlur={(e) => {
                const v = num(e.target.value);
                const next = v == null ? undefined : sign * v;
                if (next !== weight) onChange({ weight: next });
              }}
              className={inputCls}
            />
          </label>
          <div className="flex overflow-hidden rounded-lg border border-slate-200 text-xs dark:border-slate-700">
            {(["lb", "kg"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => onChange({ weightUnit: u })}
                aria-pressed={unit === u}
                className={`px-2 py-1.5 ${
                  unit === u ? "bg-sky-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One set's load: a +/− toggle and the amount. 0 is bodyweight. With nothing
 * typed yet the sign follows the target (assisted target → −).
 */
export function SignedLoadInput({
  id,
  label,
  value,
  defaultAssisted,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  defaultAssisted: boolean;
  onChange: (v: number | undefined) => void;
}) {
  // A flip made while blank sticks; until then the sign follows the target.
  const [flipped, setFlipped] = useState<boolean | null>(null);
  const assisted = value != null && value !== 0 ? value < 0 : (flipped ?? defaultAssisted);
  const amount = value != null ? Math.abs(value) : undefined;

  const flip = () => {
    setFlipped(!assisted);
    if (value != null && value !== 0) onChange(-value);
  };

  return (
    <div className="flex flex-col text-[11px] text-slate-500">
      {label}
      <div className="mt-0.5 flex">
        <button
          type="button"
          onClick={flip}
          aria-label={assisted ? "Assisted — tap for added weight" : "Added weight — tap for assisted"}
          title={assisted ? "Assisted (taken off)" : "Added weight"}
          className={`w-7 rounded-l-lg border border-r-0 text-sm font-semibold ${
            assisted
              ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
              : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          {assisted ? "−" : "+"}
        </button>
        <input
          key={`${id}-${value ?? ""}`}
          type="number"
          inputMode="decimal"
          min={0}
          defaultValue={amount ?? ""}
          placeholder="0 = BW"
          aria-label={label}
          onBlur={(e) => {
            const v = num(e.target.value);
            const next = v == null ? undefined : v === 0 ? 0 : assisted ? -v : v;
            if (next !== value) onChange(next);
          }}
          className="w-20 rounded-r-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>
    </div>
  );
}
