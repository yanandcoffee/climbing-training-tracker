import { useMemo, useState } from "react";
import { hasLogged } from "../lib/history";
import { Link } from "react-router-dom";
import {
  useActiveCheckIns,
  useActiveExercises,
  useActiveWorkouts,
} from "../store/useStore";
import { shortDate } from "../lib/dates";
import TrendChart from "../components/TrendChart";

export default function ProgressScreen() {
  const checkIns = useActiveCheckIns();
  const workouts = useActiveWorkouts();
  const exercises = useActiveExercises();
  const [mode, setMode] = useState<"daily" | "cumulative">("daily");

  const sorted = useMemo(
    () => [...checkIns].sort((a, b) => a.date.localeCompare(b.date)),
    [checkIns],
  );
  const total = sorted.reduce((s, c) => s + c.points, 0);

  const chartData = useMemo(() => {
    let running = 0;
    return sorted.map((c) => {
      running += c.points;
      return { date: shortDate(c.date), value: mode === "daily" ? c.points : running };
    });
  }, [sorted, mode]);

  // Exercises that have been done (or logged) at least once.
  const loggedIds = useMemo(() => {
    const set = new Set<string>();
    for (const w of workouts)
      for (const we of w.exercises)
        // Done/partial counts (the target is taken as done), as do logged numbers.
        if (
          we.exerciseId &&
          (we.status === "complete" ||
            we.status === "partial" ||
            hasLogged(we.metrics))
        )
          set.add(we.exerciseId);
    return set;
  }, [workouts]);
  const tracked = exercises.filter((e) => loggedIds.has(e.id));

  return (
    <div className="space-y-4 py-4">
      <header className="flex min-h-16 items-center">
        <h1 className="text-xl font-bold">Progress</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total readiness" value={total > 0 ? `+${total}` : `${total}`} />
        <Stat label="Check-ins" value={`${sorted.length}`} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Readiness over time</h2>
          <div className="flex gap-1.5">
            {(["daily", "cumulative"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                  mode === m
                    ? "bg-sky-600 text-white"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {chartData.length >= 1 ? (
          <TrendChart data={chartData} label="Readiness" />
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">
            No check-ins yet. Rate how you feel on the Today screen.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Tracked exercises
        </h2>
        {tracked.length ? (
          <ul className="space-y-2">
            {tracked.map((e) => (
              <li key={e.id}>
                <Link
                  to={`/exercise/${e.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700"
                >
                  <span className="font-medium">{e.name}</span>
                  <span className="text-sm text-sky-600 dark:text-sky-400">
                    View trend →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">
            Mark exercises Done in a workout (or log numbers) to build trends.
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
