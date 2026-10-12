import { useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { dateKey, parseKey, todayKey } from "../lib/dates";

/** Month grid where tapping days toggles them. Days with a workout get a dot. */
export default function MultiDatePicker({
  selected,
  onChange,
  markedDates,
}: {
  selected: string[];
  onChange: (dates: string[]) => void;
  markedDates?: Set<string>;
}) {
  const [cursor, setCursor] = useState(() =>
    startOfMonth(selected[0] ? parseKey(selected[0]) : new Date()),
  );
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor)),
    end: endOfWeek(endOfMonth(cursor)),
  });
  const today = todayKey();
  const sel = new Set(selected);

  const toggle = (key: string) =>
    onChange(sel.has(key) ? selected.filter((d) => d !== key) : [...selected, key].sort());

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor((c) => subMonths(c, 1))}
          className="rounded-lg bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800"
          aria-label="previous month"
        >
          ‹
        </button>
        <span className="text-sm font-medium">{format(cursor, "MMMM yyyy")}</span>
        <button
          type="button"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          className="rounded-lg bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800"
          aria-label="next month"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = dateKey(d);
          const on = sel.has(key);
          const inMonth = isSameMonth(d, cursor);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              aria-pressed={on}
              aria-label={format(d, "EEEE d MMMM")}
              className={`relative flex h-9 flex-col items-center justify-center rounded-lg text-sm ${
                on
                  ? "bg-sky-600 font-semibold text-white"
                  : inMonth
                    ? "bg-slate-50 dark:bg-slate-800"
                    : "text-slate-300 dark:text-slate-600"
              } ${key === today && !on ? "ring-1 ring-sky-500" : ""}`}
            >
              {format(d, "d")}
              {markedDates?.has(key) && (
                <span
                  className={`absolute bottom-1 h-1 w-1 rounded-full ${on ? "bg-white" : "bg-sky-500"}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
