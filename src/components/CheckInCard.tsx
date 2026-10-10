import { useState } from "react";
import type { DayColor } from "../types";
import { COLOR_LABELS } from "../types";
import {
  COLOR_HEX,
  nearestPointOption,
  pointOptions,
  qualityForPoints,
} from "../lib/scoring";
import { checkInForDate, useStore } from "../store/useStore";

const COLORS: DayColor[] = ["green", "yellow", "orange", "red", "black"];

const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export default function CheckInCard({ date }: { date: string }) {
  const existing = useStore((s) => checkInForDate(s, date));
  const upsert = useStore((s) => s.upsertCheckIn);

  const [color, setColor] = useState<DayColor>(existing?.color ?? "green");
  const [points, setPoints] = useState<number>(
    existing ? nearestPointOption(existing.color, existing.points) : 5,
  );
  const [note, setNote] = useState<string>(existing?.note ?? "");

  // Re-sync local state if the stored check-in changes (e.g. navigation).
  const signature = `${existing?.id ?? ""}:${existing?.updatedAt ?? ""}`;
  const [seen, setSeen] = useState(signature);
  if (signature !== seen) {
    setSeen(signature);
    const c = existing?.color ?? "green";
    setColor(c);
    setPoints(existing ? nearestPointOption(c, existing.points) : 5);
    setNote(existing?.note ?? "");
  }

  const options = pointOptions(color);
  const hasSlots = options.length > 1;

  const commit = (next: { color?: DayColor; points?: number; note?: string }) => {
    const c = next.color ?? color;
    const p = next.points ?? points;
    upsert(date, {
      color: c,
      quality: qualityForPoints(c, p),
      note: (next.note ?? note) || undefined,
    });
  };

  const pickColor = (c: DayColor) => {
    // Default to the mildest slot of the new color (green: best day; others: least severe).
    const opts = pointOptions(c);
    const p = c === "green" ? opts[opts.length - 1] : opts[0];
    setColor(c);
    setPoints(p);
    commit({ color: c, points: p });
  };

  const pickPoints = (p: number) => {
    setPoints(p);
    commit({ points: p });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">How do you feel today?</h2>
        <span
          className="rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums text-white"
          style={{ backgroundColor: COLOR_HEX[color] }}
          aria-label="readiness points"
        >
          {fmt(points)}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-5 gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => pickColor(c)}
            className={`h-11 rounded-xl border-2 transition-all ${
              color === c
                ? "scale-105 border-slate-900 dark:border-white"
                : "border-transparent opacity-80"
            }`}
            style={{ backgroundColor: COLOR_HEX[c] }}
            aria-label={c}
            aria-pressed={color === c}
          />
        ))}
      </div>

      <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
        {COLOR_LABELS[color]}
      </p>

      {hasSlots && (
        <div className="mb-3">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>{color === "green" ? "a little positive" : "mild"}</span>
            <span>{color === "green" ? "strong" : "severe"}</span>
          </div>
          <div
            role="radiogroup"
            aria-label="Points"
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${options.length > 5 ? 5 : options.length}, minmax(0, 1fr))`,
            }}
          >
            {options.map((p) => {
              const active = p === points;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => pickPoints(p)}
                  className={`h-10 rounded-lg border-2 text-sm font-semibold tabular-nums transition-colors ${
                    active
                      ? "text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                  style={
                    active
                      ? { backgroundColor: COLOR_HEX[color], borderColor: COLOR_HEX[color] }
                      : undefined
                  }
                >
                  {fmt(p)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => commit({})}
        placeholder="Optional note (sleep, soreness, injury detail…)"
        rows={2}
        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800"
      />
    </section>
  );
}
