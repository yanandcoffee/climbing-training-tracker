import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  Exercise,
  ExerciseStatus,
  Metrics,
  SetResult,
  Workout,
  WorkoutExercise,
  WorkoutSection,
} from "../types";
import { activeWorkouts, useActiveExercises, useActiveWorkouts, useStore } from "../store/useStore";
import {
  combineSections,
  containerOf,
  deleteSection,
  hasProgress,
  keepTargetOf,
  findSectionByTitle,
  groupItems,
  mergeDuplicateSections,
  isEmptyWorkout,
  lastUseOf,
  moveItemTo,
  moveSectionTo,
  nextSectionTitle,
  prescriptionSummary,
  sectionByCategory,
  sectionForCategory,
} from "../lib/workoutPlan";
import { uid } from "../lib/id";
import { shortDate } from "../lib/dates";
import { loggedSets } from "../lib/history";
import { ExerciseMediaThumb } from "./ExerciseMedia";
import AddExercisePanel from "./AddExercisePanel";
import PrescriptionEditor from "./PrescriptionEditor";
import { SignedLoadInput } from "./LoadInput";
import ImportNotesDialog from "./ImportNotesDialog";
import CopyWorkoutDialog from "./CopyWorkoutDialog";

type Dialog = "import" | "copyFrom" | "copyTo" | null;

const card =
  "rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

// Droppable ids for whole sections ("" = exercises not in a section).
const DROP = "section:";

export default function WorkoutDayView({ date }: { date: string }) {
  const getOrCreate = useStore((s) => s.getOrCreateWorkoutForDate);
  const workout = useStore((s) => activeWorkouts(s).find((w) => w.date === date));
  const library = useActiveExercises();
  const workouts = useActiveWorkouts();
  const saveWorkout = useStore((s) => s.saveWorkout);
  const addExercise = useStore((s) => s.addExercise);

  const [adding, setAdding] = useState<{ sectionId?: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  // A section just made with "＋ Section", whose name opens for editing.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [reorderingSections, setReorderingSections] = useState(false);
  // While dragging: the previewed order (committed on drop).
  const [dragItems, setDragItems] = useState<WorkoutExercise[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Lazily create the (empty) workout record for this day when it's opened.
  useEffect(() => {
    getOrCreate(date);
  }, [date, getOrCreate]);

  // Repair workouts that ended up with two sections of the same name.
  useEffect(() => {
    if (!workout) return;
    const merged = mergeDuplicateSections({ ...workout, sections: workout.sections ?? [] });
    if (merged) saveWorkout(merged);
  }, [workout, saveWorkout]);

  if (!workout) {
    return (
      <section className={card}>
        <p className="text-sm text-slate-400">Preparing workout…</p>
      </section>
    );
  }

  // Always edit the latest stored version, so rapid successive edits never drop each other.
  const update = (fn: (w: Workout) => Workout) => {
    const latest = activeWorkouts(useStore.getState()).find((w) => w.date === date) ?? workout;
    saveWorkout(fn(latest));
  };
  const updateItem = (id: string, patch: Partial<WorkoutExercise>) =>
    update((w) => ({
      ...w,
      exercises: w.exercises.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  const removeItem = (id: string) =>
    update((w) => ({ ...w, exercises: w.exercises.filter((e) => e.id !== id) }));
  const addSection = () => {
    const id = uid();
    update((w) => {
      const existing = w.sections ?? [];
      return { ...w, sections: [...existing, { id, title: nextSectionTitle(existing) }] };
    });
    setRenamingId(id);
    if (adding) setAdding({ sectionId: id });
  };
  const renameSection = (id: string, title: string) =>
    update((w) => ({
      ...w,
      sections: (w.sections ?? []).map((s) => (s.id === id ? { ...s, title } : s)),
    }));
  const removeSection = (id: string, keepExercises: boolean) => {
    update((w) => deleteSection({ ...w, sections: w.sections ?? [] }, id, keepExercises));
    if (adding?.sectionId === id) setAdding({});
  };
  const combineSection = (fromId: string, intoId: string) => {
    update((w) => combineSections({ ...w, sections: w.sections ?? [] }, fromId, intoId));
    if (adding?.sectionId === fromId) setAdding({ sectionId: intoId });
  };
  const moveSection = (id: string, index: number) =>
    update((w) => ({ ...w, sections: moveSectionTo(w.sections ?? [], id, index) }));

  const sections = workout.sections ?? [];
  const shown = dragItems ?? workout.exercises;
  const itemsIn = (list: WorkoutExercise[], c: string) => list.filter((e) => containerOf(e, sections) === c);
  const unsectioned = itemsIn(shown, "");
  const exById = new Map(library.map((e) => [e.id, e]));
  const earlier = workouts.filter((w) => w.date < date);
  const empty = isEmptyWorkout(workout);
  const done = workout.exercises.filter((e) => e.status === "complete").length;

  const dialogs = (
    <>
      {dialog === "import" && <ImportNotesDialog initialDate={date} onClose={() => setDialog(null)} />}
      {(dialog === "copyFrom" || dialog === "copyTo") && (
        <CopyWorkoutDialog
          date={date}
          direction={dialog === "copyFrom" ? "from" : "to"}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );

  // Keyed so it stays mounted (keeping its state) when the first add turns
  // an empty day into a workout and the layout around it changes.
  const addPanel = adding && (
    <AddExercisePanel
      key="add-panel"
      date={date}
      library={library}
      workouts={workouts}
      sections={sections}
      items={workout.exercises}
      sectionId={adding.sectionId}
      onSortByCategory={() => setAdding({})}
      onCreateExercise={(data) => addExercise(data)}
      onAdd={(item, newTitle) => {
        let usedId: string | undefined;
        update((w) => {
          let sections = w.sections ?? [];
          let exercises = w.exercises;
          if (newTitle) {
            // Never create a second section with the same name — reuse it.
            usedId = findSectionByTitle(sections, newTitle)?.id;
            if (!usedId) {
              usedId = uid();
              sections = [...sections, { id: usedId, title: newTitle }];
            }
          } else if (item.sectionId && sections.some((s) => s.id === item.sectionId)) {
            usedId = item.sectionId;
          } else {
            // By default each exercise goes to the section for its category.
            // A day that's still one plain list gets organized the same way.
            if (!sections.length) ({ sections, exercises } = sectionByCategory({ sections, exercises }));
            ({ sections, id: usedId } = sectionForCategory(sections, item.category));
          }
          return { ...w, sections, exercises: [...exercises, { ...item, sectionId: usedId }] };
        });
        // A section chosen on purpose stays the target; otherwise keep sorting by category.
        if (newTitle || item.sectionId) setAdding({ sectionId: usedId });
        setOpenId(item.id);
      }}
      onClose={() => setAdding(null)}
    />
  );

  if (empty) {
    return (
      <section className={card}>
        <h2 className="mb-1 text-base font-semibold">Workout</h2>
        <p className="mb-3 text-sm text-slate-500">Nothing planned for {shortDate(date)} yet.</p>
        {addPanel || (
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setDialog("import")}
              className="rounded-xl bg-sky-600 px-4 py-3 text-left text-white"
            >
              <span className="block font-medium">📋 Import coach's note</span>
              <span className="block text-xs opacity-80">Paste a note; it becomes this day's workout</span>
            </button>
            <button
              type="button"
              onClick={() => setDialog("copyFrom")}
              disabled={!workouts.some((w) => w.date !== date && !isEmptyWorkout(w))}
              className="rounded-xl border border-slate-200 px-4 py-3 text-left disabled:opacity-40 dark:border-slate-700"
            >
              <span className="block font-medium">⧉ Copy a previous workout</span>
              <span className="block text-xs text-slate-500">Autofill everything, then adjust sets/reps</span>
            </button>
            <button
              type="button"
              onClick={() => setAdding({})}
              className="rounded-xl border border-slate-200 px-4 py-3 text-left dark:border-slate-700"
            >
              <span className="block font-medium">＋ Build it exercise by exercise</span>
              <span className="block text-xs text-slate-500">Each one pre-fills from last time</span>
            </button>
          </div>
        )}
        {dialogs}
      </section>
    );
  }

  // One sortable list per section; drag between them to move an exercise across.
  const renderItems = (c: string) => {
    const items = itemsIn(shown, c);
    return (
      <SortableContext items={items.map((e) => e.id)} strategy={verticalListSortingStrategy}>
        {items.length ? (
          <div className="space-y-2">
            {groupItems(items).map((g, gi) => (
              <div key={gi} className={g.group ? "mt-1" : ""}>
                {g.group && <p className="mb-1.5 text-xs font-semibold text-slate-500">{g.group}</p>}
                <ul className={`space-y-2 ${g.group ? "border-l-2 border-slate-100 pl-2 dark:border-slate-800" : ""}`}>
                  {g.items.map((we) => (
                    <ExerciseRow
                      key={we.id}
                      we={we}
                      lib={we.exerciseId ? exById.get(we.exerciseId) : undefined}
                      last={we.exerciseId ? lastUseOf(earlier, we.exerciseId) : undefined}
                      open={openId === we.id}
                      onToggleOpen={() => setOpenId((id) => (id === we.id ? null : we.id))}
                      onChange={(patch) => updateItem(we.id, patch)}
                      onRemove={() => removeItem(we.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <EmptyDrop id={DROP + c} />
        )}
      </SortableContext>
    );
  };

  const placeOf = (list: WorkoutExercise[], id: string) => {
    const item = list.find((e) => e.id === id);
    return item ? { item, c: containerOf(item, sections) } : null;
  };
  const onDragStart = ({ active }: DragStartEvent) => {
    setDragItems(workout.exercises);
    setActiveId(String(active.id));
  };
  const onDragCancel = () => {
    setDragItems(null);
    setActiveId(null);
  };
  // Crossing into another section moves the item there in the preview.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !dragItems) return;
    const from = placeOf(dragItems, String(active.id));
    if (!from) return;
    const overId = String(over.id);
    let to: string;
    let index: number;
    if (overId.startsWith(DROP)) {
      to = overId.slice(DROP.length);
      index = itemsIn(dragItems, to).length;
    } else {
      const target = placeOf(dragItems, overId);
      if (!target) return;
      to = target.c;
      const r = active.rect.current.translated;
      const below = !!r && r.top > over.rect.top + over.rect.height / 2;
      index = itemsIn(dragItems, to).indexOf(target.item) + (below ? 1 : 0);
    }
    if (to === from.c) return;
    setDragItems(moveItemTo(dragItems, sections, from.item.id, to, index, { regroup: false }));
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const list = dragItems;
    onDragCancel();
    if (!list || !over) return;
    const from = placeOf(list, String(active.id));
    if (!from) return;
    const target = placeOf(list, String(over.id));
    const inC = itemsIn(list, from.c);
    const index = target && target.c === from.c ? inC.indexOf(target.item) : inC.length - 1;
    const final = moveItemTo(list, sections, from.item.id, from.c, index);
    const same = (a: WorkoutExercise[]) =>
      a.length === final.length &&
      a.every((e, i) => e.id === final[i].id && e.sectionId === final[i].sectionId && e.group === final[i].group);
    if (same(workout.exercises)) return;
    // Apply the new order to the latest stored items, keeping any edits made meanwhile.
    update((w) => {
      const byId = new Map(w.exercises.map((e) => [e.id, e]));
      const ordered = final.flatMap((f) => {
        const e = byId.get(f.id);
        return e ? [{ ...e, sectionId: f.sectionId, group: f.group }] : [];
      });
      return { ...w, exercises: [...ordered, ...w.exercises.filter((e) => !final.some((f) => f.id === e.id))] };
    });
  };
  const dragging = activeId ? shown.find((e) => e.id === activeId) : undefined;

  return (
    <section className={card}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <input
          key={`name-${workout.name ?? ""}`}
          defaultValue={workout.name ?? ""}
          placeholder="Workout"
          onBlur={(e) => {
            const v = e.target.value.trim() || undefined;
            if (v !== workout.name) update((w) => ({ ...w, name: v }));
          }}
          className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-slate-900 dark:placeholder:text-slate-100"
          aria-label="Workout name"
        />
        <span className="shrink-0 text-xs tabular-nums text-slate-500">
          {done}/{workout.exercises.length} done
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <ActionBtn primary onClick={() => setAdding(adding ? null : {})}>
          ＋ Exercise
        </ActionBtn>
        <ActionBtn onClick={addSection}>＋ Section</ActionBtn>
        <ActionBtn onClick={() => setDialog("import")}>📋 Import note</ActionBtn>
        <ActionBtn onClick={() => setDialog("copyFrom")}>⧉ Copy from…</ActionBtn>
        <ActionBtn onClick={() => setDialog("copyTo")}>Copy to…</ActionBtn>
        {confirmClear ? (
          <span className="flex items-center gap-1 text-xs">
            <ActionBtn
              danger
              onClick={() => {
                update((w) => ({ ...w, name: undefined, sections: [], exercises: [] }));
                setConfirmClear(false);
              }}
            >
              Yes, clear day
            </ActionBtn>
            <ActionBtn onClick={() => setConfirmClear(false)}>Cancel</ActionBtn>
          </span>
        ) : (
          <ActionBtn onClick={() => setConfirmClear(true)}>Clear</ActionBtn>
        )}
      </div>

      {addPanel}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="space-y-5">
          {unsectioned.length > 0 && (
            <div>
              {sections.length > 0 && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Not in a section</p>
              )}
              {renderItems("")}
            </div>
          )}
          {reorderingSections && sections.length > 1 ? (
            <SectionReorder
              sections={sections}
              counts={new Map(sections.map((s) => [s.id, itemsIn(shown, s.id).length]))}
              onMove={moveSection}
              onDone={() => setReorderingSections(false)}
            />
          ) : (
            sections.map((s, i) => {
              const items = itemsIn(shown, s.id);
              return (
                <SectionBlock
                  key={s.id}
                  section={s}
                  index={i}
                  count={sections.length}
                  itemCount={items.length}
                  progressCount={items.filter(hasProgress).length}
                  keepTargetTitle={keepTargetOf(sections, s.id)?.title}
                  others={sections.filter((o) => o.id !== s.id)}
                  onCombine={(intoId) => combineSection(s.id, intoId)}
                  startEditing={renamingId === s.id}
                  onRename={(t) => renameSection(s.id, t)}
                  onDoneEditing={() => setRenamingId(null)}
                  onAdd={() => setAdding({ sectionId: s.id })}
                  onMove={(dir) => moveSection(s.id, i + dir)}
                  onReorder={() => setReorderingSections(true)}
                  onDelete={(keep) => removeSection(s.id, keep)}
                >
                  {renderItems(s.id)}
                </SectionBlock>
              );
            })
          )}
        </div>
        <DragOverlay>
          {dragging && (
            <div className="flex items-center gap-2 rounded-xl border border-sky-400 bg-white p-3 shadow-lg dark:bg-slate-900">
              <GripIcon />
              <div className="min-w-0">
                <p className="truncate font-medium">{dragging.name}</p>
                <p className="text-xs text-slate-500">
                  {prescriptionSummary(dragging.measureType, dragging.prescription)}
                </p>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {dialogs}
    </section>
  );
}

function ActionBtn({
  children,
  onClick,
  primary,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
        primary
          ? "bg-sky-600 text-white"
          : danger
            ? "bg-red-600 text-white"
            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

/** Drop target for a section with no exercises. */
function EmptyDrop({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border border-dashed px-3 py-4 text-center text-xs ${
        isOver ? "border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" : "border-slate-300 text-slate-400 dark:border-slate-700"
      }`}
    >
      Empty — drag exercises here, or ＋ Add
    </div>
  );
}

function GripIcon() {
  return (
    <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" className="fill-current">
      {[2, 8, 14].flatMap((y) => [2, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
    </svg>
  );
}

function SectionBlock({
  section,
  index,
  count,
  itemCount,
  progressCount,
  keepTargetTitle,
  others,
  onCombine,
  startEditing,
  onRename,
  onDoneEditing,
  onAdd,
  onMove,
  onReorder,
  onDelete,
  children,
}: {
  section: WorkoutSection;
  index: number;
  count: number;
  itemCount: number;
  /** Exercises in it that are marked or logged. */
  progressCount: number;
  /** Where kept exercises would go if it's deleted. */
  keepTargetTitle?: string;
  /** The workout's other sections, to combine into. */
  others: WorkoutSection[];
  onCombine: (intoId: string) => void;
  startEditing?: boolean;
  onRename: (title: string) => void;
  onDoneEditing: () => void;
  onAdd: () => void;
  onMove: (dir: -1 | 1) => void;
  onReorder: () => void;
  onDelete: (keepExercises: boolean) => void;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(!!startEditing);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [combining, setCombining] = useState(false);
  // Renamed to another section's name: offer to combine instead of making a duplicate.
  const [clash, setClash] = useState<WorkoutSection | null>(null);
  const pick = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  const menuItem = "block w-full px-3 py-2 text-left text-sm disabled:opacity-40";
  const n = itemCount;

  return (
    <div>
      <div className="relative mb-2 flex items-center justify-between gap-2">
        {editing ? (
          <input
            autoFocus
            defaultValue={section.title}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== section.title) {
                const same = findSectionByTitle(others, v);
                if (same) setClash(same);
                else onRename(v);
              }
              setEditing(false);
              onDoneEditing();
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
            title="Rename section"
          >
            {section.title} <span className="font-normal normal-case">✎</span>
          </button>
        )}
        <span className="flex shrink-0 items-center gap-1 text-xs">
          <button type="button" onClick={onAdd} className="px-1 py-1 text-sky-600 dark:text-sky-400">
            ＋ Add
          </button>
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-label={`Section options for ${section.title}`}
            aria-expanded={menu}
            className="rounded-md px-2 py-1 text-base leading-none text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ⋯
          </button>
        </span>
        {menu && (
          <>
            {/* Tapping anywhere else closes the menu. */}
            <button type="button" aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
            <div
              role="menu"
              className="absolute top-full right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            >
              <button type="button" role="menuitem" className={menuItem} onClick={pick(() => setEditing(true))}>
                Rename
              </button>
              <button type="button" role="menuitem" className={menuItem} disabled={index === 0} onClick={pick(() => onMove(-1))}>
                Move up
              </button>
              <button type="button" role="menuitem" className={menuItem} disabled={index === count - 1} onClick={pick(() => onMove(1))}>
                Move down
              </button>
              {count > 1 && (
                <button type="button" role="menuitem" className={menuItem} onClick={pick(onReorder)}>
                  Reorder sections…
                </button>
              )}
              {count > 1 && (
                <button type="button" role="menuitem" className={menuItem} onClick={pick(() => setCombining(true))}>
                  Combine with…
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className={`${menuItem} text-red-600 dark:text-red-400`}
                // Nothing in it: nothing to ask about.
                onClick={pick(() => (n ? setConfirmDelete(true) : onDelete(false)))}
              >
                Delete section…
              </button>
            </div>
          </>
        )}
      </div>
      {clash && (
        <div className="mb-2 space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/40">
          <p>
            There's already a <span className="font-semibold">“{clash.title}”</span> section. Combine “{section.title}”
            into it?
          </p>
          <button
            type="button"
            onClick={() => {
              setClash(null);
              onCombine(clash.id);
            }}
            className="w-full rounded-lg bg-sky-600 px-3 py-2 text-left font-medium text-white"
          >
            Combine into {clash.title}
          </button>
          <button type="button" onClick={() => setClash(null)} className="w-full py-1 text-slate-500">
            Cancel (keep “{section.title}”)
          </button>
        </div>
      )}
      {combining && (
        <div className="mb-2 space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/40">
          <p>
            <span className="font-semibold">Combine “{section.title}” into…</span>{" "}
            {n
              ? `Its ${n === 1 ? "1 exercise moves" : `${n} exercises move`} to the end of the section you pick.`
              : "It's empty, so it's just removed."}
          </p>
          {others.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setCombining(false);
                onCombine(o.id);
              }}
              className="w-full rounded-lg bg-white px-3 py-2 text-left font-medium dark:bg-slate-900"
            >
              {o.title}
            </button>
          ))}
          <button type="button" onClick={() => setCombining(false)} className="w-full py-1 text-slate-500">
            Cancel
          </button>
        </div>
      )}
      {confirmDelete && (
        <div className="mb-2 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
          <p>
            <span className="font-semibold">Delete “{section.title}”?</span> It has {n} exercise{n === 1 ? "" : "s"}
            {progressCount > 0 && (
              <span className="font-medium text-red-700 dark:text-red-300">
                {" "}({progressCount} with progress marked or logged)
              </span>
            )}
            .
          </p>
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(false);
              onDelete(true);
            }}
            className="w-full rounded-lg bg-white px-3 py-2 text-left font-medium dark:bg-slate-900"
          >
            Keep the exercises → {keepTargetTitle ? <>move to {keepTargetTitle}</> : "leave them without a section"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(false);
              onDelete(false);
            }}
            className="w-full rounded-lg bg-red-600 px-3 py-2 text-left font-medium text-white"
          >
            Delete the section and its {n} exercise{n === 1 ? "" : "s"}
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="w-full py-1 text-slate-500">
            Cancel
          </button>
        </div>
      )}
      {section.notes?.length ? (
        <ul className="mb-2 space-y-0.5 rounded-lg bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {section.notes.map((n, i) => (
            <li key={i}>💡 {n}</li>
          ))}
        </ul>
      ) : null}
      {children}
    </div>
  );
}

/** Compact list of section titles to drag into a new order. */
function SectionReorder({
  sections,
  counts,
  onMove,
  onDone,
}: {
  sections: WorkoutSection[];
  counts: Map<string, number>;
  onMove: (id: string, index: number) => void;
  onDone: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/30">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Reorder sections</p>
        <button type="button" onClick={onDone} className="rounded-lg bg-sky-600 px-3 py-1 text-sm font-medium text-white">
          Done
        </button>
      </div>
      <p className="text-[11px] text-slate-500">Drag by the handle. Exercises move with their section.</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={({ active, over }) => {
          if (over && active.id !== over.id) onMove(String(active.id), sections.findIndex((s) => s.id === over.id));
        }}
      >
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {sections.map((s) => (
              <SectionReorderRow key={s.id} section={s} count={counts.get(s.id) ?? 0} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SectionReorderRow({ section, count }: { section: WorkoutSection; count: number }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1 pr-3 pl-1 dark:border-slate-700 dark:bg-slate-900 ${
        isDragging ? "relative z-10 shadow-lg" : ""
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder section ${section.title}`}
        className="flex min-h-10 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-slate-400 active:cursor-grabbing"
      >
        <GripIcon />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{section.title}</span>
      <span className="shrink-0 text-xs text-slate-400">
        {count} exercise{count === 1 ? "" : "s"}
      </span>
    </li>
  );
}

const STATUS_META: Record<
  Exclude<ExerciseStatus, "none">,
  { icon: string; label: string; cls: string }
> = {
  complete: { icon: "✓", label: "Done", cls: "bg-green-600 text-white" },
  partial: { icon: "◐", label: "Partial", cls: "bg-amber-500 text-white" },
  skipped: { icon: "✗", label: "Skip", cls: "bg-slate-500 text-white" },
};

function ExerciseRow({
  we,
  lib,
  last,
  open,
  onToggleOpen,
  onChange,
  onRemove,
}: {
  we: WorkoutExercise;
  lib?: Exercise;
  last?: ReturnType<typeof lastUseOf>;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (patch: Partial<WorkoutExercise>) => void;
  onRemove: () => void;
}) {
  const navigate = useNavigate();
  const summary = prescriptionSummary(we.measureType, we.prescription);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: we.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-xl border border-slate-200 bg-white py-3 pr-3 pl-1 dark:border-slate-700 dark:bg-slate-900 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${we.name}`}
          className="-my-1 flex min-h-11 w-7 shrink-0 cursor-grab touch-none items-center justify-center self-stretch text-slate-300 active:cursor-grabbing dark:text-slate-600"
        >
          <GripIcon />
        </button>
        {lib?.mediaUrl && (
          <ExerciseMediaThumb ex={lib} onClick={() => navigate(`/exercise/${lib.id}`)} />
        )}
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onToggleOpen} className="block w-full text-left">
            <p className="font-medium">{we.name}</p>
            <p className="text-xs text-slate-500">
              {summary ? (
                <span className="font-medium text-slate-700 dark:text-slate-300">{summary}</span>
              ) : (
                <span className="italic">{we.measureType === "check" ? "Just do it" : "Tap to set target"}</span>
              )}
              {we.notes ? ` · ${we.notes}` : ""}
            </p>
          </button>

          <div className="mt-2 flex items-center gap-1.5">
            {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((s) => {
              const active = we.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ status: active ? "none" : s })}
                  aria-pressed={active}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? STATUS_META[s].cls
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  <span>{STATUS_META[s].icon}</span>
                  {STATUS_META[s].label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onToggleOpen}
              className="ml-auto rounded-lg px-2 py-1 text-xs text-sky-600 dark:text-sky-400"
              aria-expanded={open}
            >
              {open ? "Close" : "Edit / log"}
            </button>
          </div>

          {open && (
            <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60">
              {last && (
                <p className="text-[11px] text-slate-500">
                  Last time ({shortDate(last.date)}):{" "}
                  {prescriptionSummary(last.measureType, last.prescription) || "no target"}
                </p>
              )}
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Target for this workout
                </p>
                <PrescriptionEditor item={we} onChange={onChange} />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  What you did <span className="font-normal normal-case">(optional — “Done” counts the target)</span>
                </p>
                <MetricsEntry we={we} onMetrics={(m) => onChange({ metrics: { ...we.metrics, ...m } })} />
              </div>
              <div className="flex items-center justify-end text-xs">
                <button type="button" onClick={onRemove} className="text-red-600 dark:text-red-400">
                  Remove from workout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Per-set log: one row per set, so 10 / 10 / 8 can be recorded as it happened. */
function MetricsEntry({ we, onMetrics }: { we: WorkoutExercise; onMetrics: (m: Metrics) => void }) {
  const m = we.metrics ?? {};
  const unit = we.prescription?.weightUnit ?? "lb";
  const p = we.prescription;
  const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));

  const logged = loggedSets(m);
  // Always show at least one (blank) row so a single result is still one step.
  const rows: SetResult[] = logged.length ? logged : [{}];
  const t = we.measureType;
  // Intervals log reps (on/off cycles done) when the target has reps per set, else seconds on.
  const intervalReps = t === "intervals" && p?.reps != null;
  const showReps = t === "reps" || t === "reps_in_time" || intervalReps;
  const showSeconds = t === "hold" || t === "duration" || (t === "intervals" && !intervalReps);
  const showWeight = t !== "check";
  const hasSetFields = showReps || showSeconds;

  // Writing sets replaces any older single-result fields so nothing is counted twice.
  const writeSets = (next: SetResult[]) =>
    onMetrics({
      sets: next.length ? next : undefined,
      reps: undefined,
      weight: undefined,
      durationSec: undefined,
    });

  const fromTarget = (): SetResult => ({
    reps: showReps ? p?.reps : undefined,
    durationSec: showSeconds ? p?.holdSec : undefined,
    weight: showWeight ? p?.weight : undefined,
  });
  const canFill = !logged.length && (p?.reps != null || p?.holdSec != null);
  const fillFromTarget = () =>
    writeSets(Array.from({ length: Math.max(1, p?.sets ?? 1) }, fromTarget));
  const addSet = () => {
    const prev = rows[rows.length - 1];
    writeSets([...logged, logged.length ? { ...prev } : fromTarget()]);
  };
  const setField = (i: number, key: keyof SetResult, v: number | undefined) =>
    writeSets(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));

  const input =
    "mt-0.5 w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  const setInput = (i: number, label: string, key: keyof SetResult, placeholder?: string) => (
    <label className="flex flex-col text-[11px] text-slate-500">
      {label}
      <input
        key={`${we.id}-s${i}-${key}-${rows[i][key] ?? ""}`}
        type="number"
        inputMode="decimal"
        defaultValue={rows[i][key] ?? ""}
        placeholder={placeholder}
        onBlur={(e) => {
          const v = num(e.target.value);
          if (v !== rows[i][key]) setField(i, key, v);
        }}
        className={input}
      />
    </label>
  );

  return (
    <div className="space-y-2">
      {hasSetFields && (
        <div className="space-y-2">
          {rows.map((_, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <span className="w-10 pb-1.5 text-xs font-medium text-slate-500">Set {i + 1}</span>
              {showReps && setInput(i, t === "reps_in_time" ? `Reps / ${p?.windowSec ?? 10}s` : "Reps", "reps")}
              {showSeconds && setInput(i, t === "intervals" ? "Seconds on" : "Seconds", "durationSec")}
              {showWeight && (
                <SignedLoadInput
                  id={`${we.id}-s${i}-weight`}
                  label={`Load ${unit}`}
                  value={rows[i].weight}
                  defaultAssisted={(p?.weight ?? 0) < 0}
                  onChange={(v) => setField(i, "weight", v)}
                />
              )}
              {logged.length > 0 && (
                <button
                  type="button"
                  onClick={() => writeSets(logged.filter((_, j) => j !== i))}
                  className="pb-1.5 text-xs text-red-600 dark:text-red-400"
                  aria-label={`Remove set ${i + 1}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={addSet}
              className="rounded-lg bg-white px-2.5 py-1 font-medium text-sky-600 dark:bg-slate-900 dark:text-sky-400"
            >
              ＋ Add set
            </button>
            {canFill && (
              <button
                type="button"
                onClick={fillFromTarget}
                className="rounded-lg bg-white px-2.5 py-1 text-slate-600 dark:bg-slate-900 dark:text-slate-300"
              >
                Fill {Math.max(1, p?.sets ?? 1)} from target
              </button>
            )}
          </div>
        </div>
      )}
      <label className="flex flex-col text-[11px] text-slate-500">
        RPE (overall)
        <input
          key={`${we.id}-rpe-${m.rpe ?? ""}`}
          type="number"
          inputMode="decimal"
          defaultValue={m.rpe ?? ""}
          placeholder="1-10"
          onBlur={(e) => {
            const v = num(e.target.value);
            if (v !== m.rpe) onMetrics({ rpe: v });
          }}
          className={input}
        />
      </label>
    </div>
  );
}
