import { useState } from "react";
import { Link } from "react-router-dom";
import type { TemplateExercise, WorkoutExercise, WorkoutTemplate } from "../types";
import { CATEGORY_LABELS } from "../types";
import {
  activeExercises,
  useActiveExercises,
  useActiveSchedule,
  useActiveTemplates,
  useStore,
} from "../store/useStore";
import AddExercisePanel from "../components/AddExercisePanel";
import { shortDate } from "../lib/dates";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ScheduleScreen() {
  const templates = useActiveTemplates();
  const schedule = useActiveSchedule();
  const library = useActiveExercises();
  const addTemplate = useStore((s) => s.addTemplate);
  const updateTemplate = useStore((s) => s.updateTemplate);
  const deleteTemplate = useStore((s) => s.deleteTemplate);
  const addScheduleEntry = useStore((s) => s.addScheduleEntry);
  const deleteScheduleEntry = useStore((s) => s.deleteScheduleEntry);

  const [editing, setEditing] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newDateTpl, setNewDateTpl] = useState("");

  const startNew = () => {
    const t = addTemplate("New template", []);
    setEditing(t.id);
  };

  const setWeekday = (weekday: number, templateId: string) => {
    schedule
      .filter((e) => e.weekday === weekday && !e.date)
      .forEach((e) => deleteScheduleEntry(e.id));
    if (templateId) addScheduleEntry({ templateId, weekday });
  };

  const dateEntries = schedule.filter((e) => e.date);

  return (
    <div className="space-y-6 py-4">
      <header className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-sm text-sky-600 dark:text-sky-400">
            ← Today
          </Link>
          <h1 className="text-xl font-bold">Schedule</h1>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          + Template
        </button>
      </header>

      {/* Templates */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Workout templates
        </h2>
        {templates.length === 0 && (
          <p className="text-sm text-slate-400">
            No templates yet. Create one, then assign it to weekdays or dates.
          </p>
        )}
        <ul className="space-y-2">
          {templates.map((t) =>
            editing === t.id ? (
              <li key={t.id}>
                <TemplateEditor
                  template={t}
                  library={library}
                  onChange={(patch) => updateTemplate(t.id, patch)}
                  onDone={() => setEditing(null)}
                  onDelete={() => {
                    if (confirm(`Delete template "${t.name}"?`)) {
                      deleteTemplate(t.id);
                      setEditing(null);
                    }
                  }}
                />
              </li>
            ) : (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700"
              >
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-slate-500">
                    {t.exercises.length} exercise
                    {t.exercises.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(t.id)}
                  className="text-sm text-sky-600 dark:text-sky-400"
                >
                  Edit
                </button>
              </li>
            ),
          )}
        </ul>
      </section>

      {/* Weekly recurring */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Weekly recurring
        </h2>
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {WEEKDAYS.map((label, wd) => {
            const entry = schedule.find((e) => e.weekday === wd && !e.date);
            return (
              <li key={wd} className="flex items-center justify-between gap-2 p-2.5">
                <span className="w-10 text-sm font-medium">{label}</span>
                <select
                  value={entry?.templateId ?? ""}
                  onChange={(e) => setWeekday(wd, e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">— rest / none —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Specific dates */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Specific dates (override weekday)
        </h2>
        <div className="flex gap-2">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <select
            value={newDateTpl}
            onChange={(e) => setNewDateTpl(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Pick template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!newDate || !newDateTpl}
            onClick={() => {
              addScheduleEntry({ templateId: newDateTpl, date: newDate });
              setNewDate("");
              setNewDateTpl("");
            }}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
        <ul className="mt-2 space-y-1.5">
          {dateEntries.map((e) => {
            const t = templates.find((x) => x.id === e.templateId);
            return (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800"
              >
                <span>
                  {shortDate(e.date!)} → {t?.name ?? "(deleted template)"}
                </span>
                <button
                  type="button"
                  onClick={() => deleteScheduleEntry(e.id)}
                  className="text-xs text-slate-400 hover:text-red-500"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function toTemplateExercise(we: WorkoutExercise): TemplateExercise {
  const { status: _status, metrics: _metrics, ...rest } = we;
  void _status;
  void _metrics;
  return rest;
}

function TemplateEditor({
  template,
  library,
  onChange,
  onDone,
  onDelete,
}: {
  template: WorkoutTemplate;
  library: ReturnType<typeof activeExercises>;
  onChange: (patch: Partial<WorkoutTemplate>) => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3 rounded-xl border border-sky-300 bg-sky-50/50 p-3 dark:border-sky-800 dark:bg-sky-950/30">
      <input
        value={template.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium dark:border-slate-700 dark:bg-slate-900"
      />

      <ul className="space-y-1.5">
        {template.exercises.map((te) => (
          <li
            key={te.id}
            className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-sm dark:bg-slate-900"
          >
            <span>
              {te.name}
              <span className="ml-2 text-[11px] text-slate-400">
                {CATEGORY_LABELS[te.category]}
              </span>
            </span>
            <button
              type="button"
              onClick={() =>
                onChange({
                  exercises: template.exercises.filter((x) => x.id !== te.id),
                })
              }
              className="text-xs text-slate-400 hover:text-red-500"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <AddExercisePanel
          library={library}
          onAdd={(we) =>
            onChange({ exercises: [...template.exercises, toTemplateExercise(we)] })
          }
          onClose={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-500 dark:border-slate-600"
        >
          + Add exercise
        </button>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white"
        >
          Done
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
