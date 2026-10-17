import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Exercise,
  ExerciseCategory,
  MeasureType,
  Workout,
  WorkoutExercise,
  WorkoutSection,
} from "../types";
import { CATEGORY_LABELS, CATEGORY_ORDER, MEASURE_LABELS, MEASURE_ORDER } from "../types";
import { shortDate } from "../lib/dates";
import { itemFromExercise, lastUseOf, nextSectionTitle, prescriptionSummary } from "../lib/workoutPlan";

const BY_CATEGORY = "";
const NEW_SECTION = "__new__";

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

export default function AddExercisePanel({
  date,
  library,
  workouts,
  sections,
  items,
  sectionId,
  onSortByCategory,
  onAdd,
  onCreateExercise,
  onClose,
}: {
  date: string;
  library: Exercise[];
  workouts: Workout[];
  sections: WorkoutSection[];
  /** This day's current items, so "Added" reflects removals. */
  items: WorkoutExercise[];
  /** Section new exercises go to; undefined = the section for each one's category. */
  sectionId?: string;
  /** Go back to adding each exercise to its category's section. */
  onSortByCategory: () => void;
  /**
   * Add an item to its section, or to a new section with this title (an
   * existing section with the same title is reused).
   */
  onAdd: (item: WorkoutExercise, newSectionTitle?: string) => void;
  /** Create a building block in the library. */
  onCreateExercise: (data: { name: string; category: ExerciseCategory; measureType: MeasureType }) => Exercise;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"library" | "new">(library.length ? "library" : "new");
  const [query, setQuery] = useState("");
  // Ids of items added from this panel; shown only while still in the workout.
  const [addedIds, setAddedIds] = useState<string[]>([]);
  // Opened (or retargeted) from a section further down: bring the panel into view.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [sectionId]);

  // Workouts strictly before this day — "last time" means previous sessions.
  const earlier = useMemo(() => workouts.filter((w) => w.date < date), [workouts, date]);
  const targetTitle = sections.find((s) => s.id === sectionId)?.title;
  const added = addedIds
    .map((id) => items.find((i) => i.id === id)?.name)
    .filter((n): n is string => !!n);

  const add = (ex: Exercise, into: { id?: string; newTitle?: string }) => {
    const item = itemFromExercise(ex, workouts, date, into.id);
    onAdd(item, into.newTitle);
    setAddedIds((a) => [...a, item.id]);
  };

  const q = query.trim().toLowerCase();
  const matches = library.filter((e) => !q || e.name.toLowerCase().includes(q));

  return (
    <div ref={panelRef} className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Add exercises</p>
        <button type="button" onClick={onClose} className="text-sm text-sky-600 dark:text-sky-400">
          Done
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        {targetTitle ? (
          <>
            Adding to{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{targetTitle}</span> ·{" "}
            <button type="button" onClick={onSortByCategory} className="text-sky-600 dark:text-sky-400">
              Sort by category instead
            </button>
          </>
        ) : (
          <>
            Each exercise goes to the section for its category (e.g.{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">Warm up</span>). Rename sections or
            drag exercises between them anytime.
          </>
        )}
      </p>

      <div className="flex gap-2">
        {(["library", "new"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t ? "bg-sky-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            {t === "library" ? "From library" : "New exercise"}
          </button>
        ))}
      </div>

      {tab === "library" ? (
        library.length === 0 ? (
          <p className="py-2 text-center text-sm text-slate-400">
            Your library is empty — create a new exercise, or import a coach's note.
          </p>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exercises"
              className={inputCls}
            />
            <div className="max-h-72 space-y-3 overflow-y-auto">
              {CATEGORY_ORDER.map((cat) => {
                const items = matches.filter((e) => e.category === cat);
                if (!items.length) return null;
                return (
                  <div key={cat}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {CATEGORY_LABELS[cat]}
                    </p>
                    <ul className="space-y-1">
                      {items.map((e) => {
                        const last = lastUseOf(earlier, e.id);
                        const lastSummary = last && prescriptionSummary(last.measureType, last.prescription);
                        return (
                          <li key={e.id}>
                            <button
                              type="button"
                              onClick={() => add(e, { id: sectionId })}
                              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm dark:border-slate-700 dark:bg-slate-900"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{e.name}</span>
                                <span className="block text-[11px] text-slate-400">
                                  {last
                                    ? `Last ${shortDate(last.date)}: ${lastSummary || "no target"}`
                                    : "Not done yet"}
                                </span>
                              </span>
                              <span className="shrink-0 text-sky-600 dark:text-sky-400">+ Add</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )
      ) : (
        <NewExerciseForm
          sections={sections}
          sectionId={sectionId}
          onCreate={(data, section) => {
            add(onCreateExercise(data), section);
            setTab("library");
          }}
        />
      )}

      {added.length > 0 && (
        <div className="space-y-0.5 text-[11px]">
          <p className="text-emerald-700 dark:text-emerald-300">Added: {added.join(", ")}</p>
          <p className="text-slate-500 dark:text-slate-400">
            Sets/reps are pre-filled from last time — tap an exercise to change them.
          </p>
        </div>
      )}
    </div>
  );
}

function NewExerciseForm({
  sections,
  sectionId,
  onCreate,
}: {
  sections: WorkoutSection[];
  sectionId?: string;
  onCreate: (
    data: { name: string; category: ExerciseCategory; measureType: MeasureType },
    section: { id?: string; newTitle?: string },
  ) => void;
}) {
  const [name, setName] = useState("");
  const [sectionChoice, setSectionChoice] = useState(sectionId ?? BY_CATEGORY);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [category, setCategory] = useState<ExerciseCategory>("strength_conditioning");
  const [measureType, setMeasureType] = useState<MeasureType>("reps");
  return (
    <div className="space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Exercise name, e.g. Shoulder shrug"
        className={inputCls}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ExerciseCategory)}
          className={inputCls}
        >
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select
          value={measureType}
          onChange={(e) => setMeasureType(e.target.value as MeasureType)}
          className={inputCls}
        >
          {MEASURE_ORDER.map((m) => (
            <option key={m} value={m}>
              {MEASURE_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <label className="block text-[11px] text-slate-500">
        Section of this workout
        <select
          value={sectionChoice}
          onChange={(e) => setSectionChoice(e.target.value)}
          className={`mt-0.5 ${inputCls}`}
        >
          <option value={BY_CATEGORY}>By category ({CATEGORY_LABELS[category]})</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
          <option value={NEW_SECTION}>New section…</option>
        </select>
      </label>
      {sectionChoice === NEW_SECTION && (
        <input
          value={newSectionTitle}
          onChange={(e) => setNewSectionTitle(e.target.value)}
          placeholder={`Section name, e.g. Post climbing (default: ${nextSectionTitle(sections)})`}
          className={inputCls}
        />
      )}
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => {
          onCreate(
            { name: name.trim(), category, measureType },
            sectionChoice === NEW_SECTION
              ? { newTitle: newSectionTitle.trim() || nextSectionTitle(sections) }
              : { id: sectionChoice || undefined },
          );
          setName("");
        }}
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
      >
        Create and add
      </button>
      <p className="text-[11px] text-slate-400">
        Saved to your library so you can reuse it. Set this workout's sets/reps on the exercise after adding.
        Sections are headings within this workout (e.g. Warm up / Post Climbing), separate from the exercise's
        category.
      </p>
    </div>
  );
}
