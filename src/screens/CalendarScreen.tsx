import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import {
  useActiveCheckIns,
  useActiveSchedule,
  useActiveWorkouts,
} from "../store/useStore";
import { dateKey, todayKey } from "../lib/dates";
import { COLOR_HEX } from "../lib/scoring";

export default function CalendarScreen() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const checkIns = useActiveCheckIns();
  const workouts = useActiveWorkouts();
  const schedule = useActiveSchedule();

  const checkByDate = new Map(checkIns.map((c) => [c.date, c]));
  const workoutDates = new Set(
    workouts.filter((w) => w.exercises.length > 0).map((w) => w.date),
  );
  const scheduledWeekdays = new Set(
    schedule.filter((s) => s.weekday != null && !s.date).map((s) => s.weekday),
  );
  const scheduledDates = new Set(
    schedule.filter((s) => s.date).map((s) => s.date),
  );

  const gridStart = startOfWeek(startOfMonth(cursor));
  const gridEnd = endOfWeek(endOfMonth(cursor));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const today = todayKey();

  return (
    <div className="space-y-4 py-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor((c) => subMonths(c, 1))}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm dark:bg-slate-800"
            aria-label="previous month"
          >
            ‹
          </button>
          <span className="w-28 text-center text-sm font-medium">
            {format(cursor, "MMMM yyyy")}
          </span>
          <button
            type="button"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm dark:bg-slate-800"
            aria-label="next month"
          >
            ›
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = dateKey(d);
          const inMonth = isSameMonth(d, cursor);
          const ci = checkByDate.get(key);
          const hasWorkout =
            workoutDates.has(key) ||
            scheduledDates.has(key) ||
            scheduledWeekdays.has(d.getDay());
          const isToday = key === today;
          return (
            <button
              key={key}
              type="button"
              onClick={() => navigate(`/day/${key}`)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm ${
                isToday
                  ? "border-sky-500"
                  : "border-transparent"
              } ${
                inMonth
                  ? "bg-white dark:bg-slate-900"
                  : "bg-transparent text-slate-300 dark:text-slate-600"
              }`}
            >
              <span>{format(d, "d")}</span>
              <span className="mt-1 flex h-2 items-center gap-0.5">
                {ci && (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: COLOR_HEX[ci.color] }}
                  />
                )}
                {hasWorkout && (
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" /> check-in colour
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> workout
        </span>
      </div>
    </div>
  );
}
