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
import PeriodNav from "./PeriodNav";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Month grid of tappable days, with the calendar's ‹ › bar to change month. Days in `markedDates` get a dot. */
export function MonthGrid({
  isSelected,
  onTap,
  markedDates,
  isDisabled,
  initialDate,
}: {
  isSelected: (key: string) => boolean;
  onTap: (key: string) => void;
  markedDates?: Set<string>;
  isDisabled?: (key: string) => boolean;
  /** Which month to open on. */
  initialDate?: string;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(initialDate ? parseKey(initialDate) : new Date()));
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor)),
    end: endOfWeek(endOfMonth(cursor)),
  });
  const today = todayKey();

  return (
    <div className="space-y-2">
      <PeriodNav
        title={format(cursor, "MMMM yyyy")}
        unit="month"
        isCurrent={isSameMonth(cursor, new Date())}
        onPrev={() => setCursor((c) => subMonths(c, 1))}
        onNext={() => setCursor((c) => addMonths(c, 1))}
        onToday={() => setCursor(startOfMonth(new Date()))}
      />
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = dateKey(d);
          const on = isSelected(key);
          const inMonth = isSameMonth(d, cursor);
          const disabled = isDisabled?.(key) ?? false;
          const isToday = key === today;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onTap(key)}
              disabled={disabled}
              aria-pressed={on}
              aria-current={isToday ? "date" : undefined}
              aria-label={format(d, "EEEE d MMMM")}
              className={`relative flex h-11 items-center justify-center rounded-lg text-base font-bold disabled:opacity-40 ${
                on
                  ? "bg-sky-600 text-white"
                  : inMonth
                    ? "bg-slate-50 dark:bg-slate-800"
                    : "text-slate-300 dark:text-slate-600"
              }`}
            >
              {/* Today gets the month view's filled circle (inverted when it's picked). */}
              <span
                className={
                  isToday
                    ? `flex h-7.5 w-7.5 items-center justify-center rounded-full ${
                        on ? "bg-white text-sky-700" : "bg-sky-600 text-white"
                      }`
                    : undefined
                }
              >
                {format(d, "d")}
              </span>
              {markedDates?.has(key) && (
                <span
                  className={`absolute bottom-0.5 h-1 w-1 rounded-full ${on ? "bg-white" : "bg-sky-500"}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  const sel = new Set(selected);
  const toggle = (key: string) =>
    onChange(sel.has(key) ? selected.filter((d) => d !== key) : [...selected, key].sort());

  return (
    <MonthGrid
      isSelected={(key) => sel.has(key)}
      onTap={toggle}
      markedDates={markedDates}
      initialDate={selected[0]}
    />
  );
}
