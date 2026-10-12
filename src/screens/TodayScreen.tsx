import { Link } from "react-router-dom";
import { todayKey, prettyDate } from "../lib/dates";
import { useActiveCheckIns } from "../store/useStore";
import CheckInCard from "../components/CheckInCard";
import WorkoutDayView from "../components/WorkoutDayView";

export default function TodayScreen() {
  const date = todayKey();
  const checkIns = useActiveCheckIns();
  const total = checkIns.reduce((sum, c) => sum + c.points, 0);

  return (
    <div className="space-y-4 py-4">
      <header className="flex min-h-16 items-center justify-between">
        <h1 className="text-xl font-bold">{prettyDate(date)}</h1>
        <Link
          to="/progress"
          className="rounded-xl bg-slate-900 px-3 py-2 text-right text-white dark:bg-slate-100 dark:text-slate-900"
        >
          <span className="block text-[10px] uppercase tracking-wide opacity-70">
            Readiness
          </span>
          <span className="text-lg font-bold tabular-nums">
            {total > 0 ? `+${total}` : total}
          </span>
        </Link>
      </header>

      <CheckInCard date={date} />

      <WorkoutDayView date={date} />
    </div>
  );
}
