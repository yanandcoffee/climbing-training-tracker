import { useMemo, useState } from "react";
import type {
  Exercise,
  ExerciseCategory,
  MeasureType,
  Workout,
  WorkoutExercise,
  WorkoutSection,
} from "../types";
import { CATEGORY_LABELS, CATEGORY_ORDER, MEASURE_LABELS } from "../types";
import { uid } from "../lib/id";
import { shortDate } from "../lib/dates";
import { itemFromExercise, lastUseOf, prescriptionSummary } from "../lib/workoutPlan";

const MEASURES: MeasureType[] = ["reps", "hold", "reps_in_time", "duration", "check"];
const NONE = "";
const NEW_SECTION = "__new__";

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

export default function AddExercisePanel({
  date,
  library,
  workouts,
  sections,
  items,
  defaultSectionId,
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
  defaultSectionId?: string;
  /**
   * Add an item, optionally creating a new section for it. Returns the section
   * id actually used (an existing section with the same title is reused).
   */
  onAdd: (item: WorkoutExercise, newSection?: WorkoutSection) => string | undefined;
  /** Create a building block in the library. */
  onCreateExercise: (data: { name: string; category: ExerciseCategory; measureType: MeasureType }) => Exercise;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"library" | "new">(library.length ? "library" : "new");
  // Where added exercises go: the section whose "＋ Add" opened the panel
  // (none for the main "＋ Exercise"). Changeable in the New exercise form.
  const [sectionId, setSectionId] = useState<string>(defaultSectionId ?? NONE);
  const [query, setQuery] = useState("");
  // Ids of items added from this panel; shown only while still in the workout.
  const [addedIds, setAddedIds] = useState<string[]>([]);

  // Workouts strictly before this day — "last time" means previous sessions.
  const earlier = useMemo(() => workouts.filter((w) => w.date < date), [workouts, date]);
  const targetTitle = sections.find((s) => s.id === sectionId)?.title;
  const added = addedIds
    .map((id) => items.find((i) => i.id === id)?.name)
    .filter((n): n is string => !!n);

  const add = (ex: Exercise, newSectionTitle?: string) => {
    const newSection = newSectionTitle ? { id: uid(), title: newSectionTitle } : undefined;
    const intoId = newSection?.id ?? (sectionId || undefined);
    const item = itemFromExercise(ex, workouts, date, intoId);
    const used = onAdd(item, newSection);
    // Later adds go to the same section (the existing one if the title matched).
    setSectionId(used ?? NONE);
    setAddedIds((a) => [...a, item.id]);
  };

  const q = query.trim().toLowerCase();
  const matches = library.filter((e) => !q || e.name.toLowerCase().includes(q));

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Add exercises</p>
        <button type="button" onClick={onClose} className="text-sm text-sky-600 dark:text-sky-400">
          Done
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        Adding to{" "}
        <span className="font-semibold text-slate-700 dark:text-slate-200">
          {targetTitle ?? "the workout (no section)"}
        </span>
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
                              onClick={() => add(e)}
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
            const ex = onCreateExercise(data);
            if (section.newTitle) add(ex, section.newTitle);
            else {
              setSectionId(section.id);
              add(ex);
            }
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
  sectionId: string;
  onCreate: (
    data: { name: string; category: ExerciseCategory; measureType: MeasureType },
    section: { id: string; newTitle?: string },
  ) => void;
}) {
  const [name, setName] = useState("");
  const [sectionChoice, setSectionChoice] = useState(sectionId);
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
          {MEASURES.map((m) => (
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
          <option value={NONE}>No section</option>
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
          placeholder="Section name, e.g. Post Climbing"
          className={inputCls}
        />
      )}
      <button
        type="button"
        disabled={!name.trim() || (sectionChoice === NEW_SECTION && !newSectionTitle.trim())}
        onClick={() => {
          onCreate(
            { name: name.trim(), category, measureType },
            sectionChoice === NEW_SECTION
              ? { id: NONE, newTitle: newSectionTitle.trim() }
              : { id: sectionChoice },
          );
          setName("");
        }}
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
      >
        Create and add
      </button>
      <p className="text-[11px] text-slate-400">
        Saved to your library so you can reuse it. Set this workout's sets/reps on the exercise after adding.
        Sections are just headings within this workout (e.g. Pre Climbing / Post Climbing) — separate from the
        exercise's category.
      </p>
    </div>
  );
}
