import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Today", icon: "☀️", end: true },
  { to: "/calendar", label: "Calendar", icon: "📅" },
  { to: "/exercises", label: "Exercises", icon: "🧗" },
  { to: "/progress", label: "Progress", icon: "📈" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 pb-safe">
      <ul className="mx-auto flex max-w-xl items-stretch justify-around">
        {tabs.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  isActive
                    ? "text-sky-600 dark:text-sky-400"
                    : "text-slate-500 dark:text-slate-400"
                }`
              }
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
