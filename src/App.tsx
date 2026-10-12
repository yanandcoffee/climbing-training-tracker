import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { useStore } from "./store/useStore";
import { useSync } from "./sync/useSync";
import BottomNav from "./components/BottomNav";
import TodayScreen from "./screens/TodayScreen";
import CalendarScreen from "./screens/CalendarScreen";
import DayScreen from "./screens/DayScreen";
import ExercisesScreen from "./screens/ExercisesScreen";
import ExerciseDetailScreen from "./screens/ExerciseDetailScreen";
import ProgressScreen from "./screens/ProgressScreen";
import SettingsScreen from "./screens/SettingsScreen";

export default function App() {
  const hydrate = useStore((s) => s.hydrate);
  const loaded = useStore((s) => s.loaded);

  useEffect(() => {
    // Hydrate local data first, then start cloud sync (no-op when unconfigured).
    void hydrate().then(() => useSync.getState().init());
  }, [hydrate]);

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <main className="mx-auto max-w-xl px-4 pt-safe pb-28">
        {loaded ? (
          <Routes>
            <Route path="/" element={<TodayScreen />} />
            <Route path="/calendar" element={<CalendarScreen />} />
            <Route path="/day/:date" element={<DayScreen />} />
            <Route path="/exercises" element={<ExercisesScreen />} />
            <Route path="/exercise/:id" element={<ExerciseDetailScreen />} />
            <Route path="/progress" element={<ProgressScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Routes>
        ) : (
          <div className="py-20 text-center text-slate-400">Loading…</div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
