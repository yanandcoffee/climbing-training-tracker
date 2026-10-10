import { useParams, Link } from "react-router-dom";
import { prettyDate, todayKey } from "../lib/dates";
import CheckInCard from "../components/CheckInCard";
import WorkoutDayView from "../components/WorkoutDayView";

export default function DayScreen() {
  const { date } = useParams<{ date: string }>();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return <p className="py-10 text-center text-slate-400">Invalid date.</p>;
  }
  const isToday = date === todayKey();

  return (
    <div className="space-y-4 py-4">
      <header className="flex items-center justify-between">
        <div>
          <Link to="/calendar" className="text-sm text-sky-600 dark:text-sky-400">
            ← Calendar
          </Link>
          <h1 className="text-xl font-bold">{prettyDate(date)}</h1>
          {isToday && <span className="text-xs text-slate-400">Today</span>}
        </div>
      </header>

      <CheckInCard date={date} />
      <WorkoutDayView date={date} />
    </div>
  );
}
