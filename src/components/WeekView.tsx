import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { addDays, addWeeks, format, isSameMonth, isSameYear, startOfWeek } from "date-fns";
import type { CheckIn, Workout } from "../types";
import { useActiveCheckIns, useActiveWorkouts, useStore } from "../store/useStore";
import { isEmptyWorkout } from "../lib/workoutPlan";
import { dateKey, todayKey } from "../lib/dates";
import { COLOR_HEX } from "../lib/scoring";

const DAY = "day:";
const EDGE_PREV = "edge:prev";
const EDGE_NEXT = "edge:next";
/** How long a dragged workout rests on an edge strip before the week flips. */
const EDGE_HOLD_MS = 600;

// The edge strips sit over the rows: under the finger, a strip wins.
const collision: CollisionDetection = (args) => {
  const edges = pointerWithin({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith("edge:")),
  });
  return edges.length ? edges : pointerWithin(args);
};
// Rows of a newly shown week, and the edge strips, appear mid-drag.
const measuring = { droppable: { strategy: MeasuringStrategy.Always } };

/**
 * Drop `from`'s workout on whatever `overId` is. A day with a workout swaps
 * with it; an empty day just takes it. Returns whether anything moved.
 */
export function dropWorkout(from: string, overId: string | null | undefined): boolean {
  if (!overId?.startsWith(DAY)) return false;
  const to = overId.slice(DAY.length);
  if (to === from) return false;
  useStore.getState().moveWorkout(from, to, "swap");
  return true;
}

/** "18 – 24 October", "29 Sep – 5 Oct", with the year when it isn't this year. */
export function weekTitle(start: Date): string {
  const end = addDays(start, 6);
  const range = isSameMonth(start, end)
    ? `${format(start, "d")} – ${format(end, "d MMMM")}`
    : `${format(start, "d MMM")} – ${format(end, "d MMM")}`;
  return isSameYear(end, new Date()) && isSameYear(start, new Date()) ? range : `${range} ${format(end, "yyyy")}`;
}

const doneCount = (w: Workout) => w.exercises.filter((e) => e.status === "complete").length;
const anyMarked = (w: Workout) => w.exercises.some((e) => e.status !== "none");

function exerciseLine(w: Workout): string {
  const names = w.exercises.map((e) => e.name);
  const shown = names.slice(0, 3).join(" · ");
  return names.length > 3 ? `${shown} +${names.length - 3}` : shown;
}

export default function WeekView() {
  const navigate = useNavigate();
  const workouts = useActiveWorkouts();
  const checkIns = useActiveCheckIns();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // The two days a drop just changed, briefly highlighted.
  const [flash, setFlash] = useState<string[]>([]);
  // Long-press starts a drag (a quick tap still opens the day). No keyboard
  // sensor: Enter on a card opens it; the day's "Move to…" covers keyboards.
  // A drop on the card it started from must not also count as a tap.
  const justDragged = useRef(false);
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(MouseSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const byDate = new Map(workouts.filter((w) => !isEmptyWorkout(w)).map((w) => [w.date, w]));
  const checkByDate = new Map(checkIns.map((c) => [c.date, c]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = todayKey();
  const thisWeek = dateKey(weekStart) === dateKey(startOfWeek(new Date()));
  const moving = activeDate ? byDate.get(activeDate) : undefined;

  useEffect(() => {
    if (!flash.length) return;
    const t = setTimeout(() => setFlash([]), 1500);
    return () => clearTimeout(t);
  }, [flash]);
  useEffect(() => () => clearTimeout(edgeTimer.current), []);

  // While held on an edge strip, keep flipping weeks every EDGE_HOLD_MS.
  const holdEdge = (id: string | null) => {
    clearTimeout(edgeTimer.current);
    if (id !== EDGE_PREV && id !== EDGE_NEXT) return;
    const step = () => {
      setWeekStart((w) => addWeeks(w, id === EDGE_NEXT ? 1 : -1));
      edgeTimer.current = setTimeout(step, EDGE_HOLD_MS);
    };
    edgeTimer.current = setTimeout(step, EDGE_HOLD_MS);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    justDragged.current = true;
    setActiveDate(String(active.id));
  };
  const onDragOver = ({ over }: DragOverEvent) => {
    const id = over ? String(over.id) : null;
    setOverId(id);
    holdEdge(id);
  };
  const finish = () => {
    holdEdge(null);
    setActiveDate(null);
    setOverId(null);
    setTimeout(() => (justDragged.current = false), 0);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const from = String(active.id);
    const id = over ? String(over.id) : null;
    finish();
    if (dropWorkout(from, id)) setFlash([from, id!.slice(DAY.length)]);
  };

  const open = (key: string) => {
    if (!justDragged.current) navigate(`/day/${key}`);
  };

  const overDate = overId?.startsWith(DAY) ? overId.slice(DAY.length) : null;
  const target = overDate && overDate !== activeDate ? byDate.get(overDate) : undefined;
  const pill = !overDate || overDate === activeDate ? null : target ? `⇄ Swap with ${target.name ?? "Workout"}` : "Move here";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setWeekStart((w) => addWeeks(w, -1))}
          className="h-11 w-11 rounded-xl bg-slate-100 text-lg dark:bg-slate-800"
          aria-label="previous week"
        >
          ‹
        </button>
        <div className="flex flex-1 flex-col items-center">
          <span className="text-[15px] font-semibold">{weekTitle(weekStart)}</span>
          {thisWeek ? (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">This week</span>
          ) : (
            <button
              type="button"
              onClick={() => setWeekStart(startOfWeek(new Date()))}
              className="text-[11px] font-medium text-sky-600 dark:text-sky-400"
            >
              Back to this week
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          className="h-11 w-11 rounded-xl bg-slate-100 text-lg dark:bg-slate-800"
          aria-label="next week"
        >
          ›
        </button>
      </div>

      {moving ? (
        <p className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs text-sky-900 dark:bg-sky-950 dark:text-sky-200">
          Moving <b>{moving.name ?? "Workout"}</b>. Drop it on a day, or hold at the top or bottom edge to change week.
        </p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Tap a day to open it. Hold a workout to drag it to another day.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        measuring={measuring}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={finish}
      >
        <ul className="space-y-1.5" aria-label="Days of the week">
          {days.map((d) => {
            const key = dateKey(d);
            return (
              <DayRow
                key={key}
                date={d}
                isToday={key === today}
                workout={byDate.get(key)}
                checkIn={checkByDate.get(key)}
                moving={activeDate === key}
                dragging={!!activeDate}
                flash={flash.includes(key)}
                onOpen={() => open(key)}
              />
            );
          })}
        </ul>

        {activeDate && (
          <>
            <EdgeStrip id={EDGE_PREV} label="▴ Hold here for last week" />
            <EdgeStrip id={EDGE_NEXT} label="Hold here for next week ▾" />
          </>
        )}

        <DragOverlay dropAnimation={null}>
          {moving && (
            <div className="-rotate-2">
              {pill && (
                <span className="mb-1.5 inline-block rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
                  {pill}
                </span>
              )}
              <CardBody workout={moving} className="border-sky-500 bg-white shadow-2xl dark:bg-slate-800" />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function DayRow({
  date,
  isToday,
  workout,
  checkIn,
  moving,
  dragging,
  flash,
  onOpen,
}: {
  date: Date;
  isToday: boolean;
  workout: Workout | undefined;
  checkIn: CheckIn | undefined;
  moving: boolean;
  dragging: boolean;
  flash: boolean;
  onOpen: () => void;
}) {
  const key = dateKey(date);
  const { setNodeRef, isOver } = useDroppable({ id: DAY + key });
  const target = isOver && dragging && !moving;

  return (
    <li ref={setNodeRef} className="flex items-stretch gap-2.5" data-date={key}>
      <div className="flex w-11 shrink-0 flex-col items-center justify-center gap-0.5">
        <span
          className={`text-[11px] font-semibold tracking-wide ${
            isToday || target ? "text-sky-600 dark:text-sky-400" : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {format(date, "EEE").toUpperCase()}
        </span>
        <span
          className={
            isToday
              ? "flex h-7.5 w-7.5 items-center justify-center rounded-full bg-sky-600 text-base font-bold text-white"
              : `text-base font-bold ${target ? "text-sky-600 dark:text-sky-400" : ""}`
          }
        >
          {format(date, "d")}
        </span>
        {checkIn && (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: COLOR_HEX[checkIn.color] }}
            title={`Check-in: ${checkIn.color}`}
          />
        )}
      </div>

      {workout && moving ? (
        <div className="flex min-h-12 min-w-0 flex-1 items-center rounded-2xl border-[1.5px] border-dashed border-slate-300 px-3 dark:border-slate-700">
          <span className="truncate text-sm text-slate-400 dark:text-slate-500">
            {workout.name ?? "Workout"} (moving)
          </span>
        </div>
      ) : workout ? (
        <WorkoutCard
          date={key}
          workout={workout}
          isToday={isToday}
          target={target}
          flash={flash}
          onOpen={onOpen}
        />
      ) : (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${format(date, "EEEE d MMMM")}: rest. Plan a workout`}
          className={`flex min-h-12 min-w-0 flex-1 items-center justify-between rounded-2xl border-[1.5px] border-dashed px-3 text-left ${
            target
              ? "border-solid border-sky-500 bg-sky-50 dark:bg-sky-950"
              : flash
                ? "border-sky-500"
                : "border-slate-300 dark:border-slate-700"
          }`}
        >
          <span className="text-sm text-slate-400 dark:text-slate-500">Rest</span>
          {!dragging && <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">＋ Plan</span>}
        </button>
      )}
    </li>
  );
}

function WorkoutCard({
  date,
  workout,
  isToday,
  target,
  flash,
  onOpen,
}: {
  date: string;
  workout: Workout;
  isToday: boolean;
  target: boolean;
  flash: boolean;
  onOpen: () => void;
}) {
  const { setNodeRef, listeners } = useDraggable({ id: date });
  const border = target
    ? "border-2 border-sky-500 bg-sky-50 dark:bg-sky-950"
    : isToday
      ? "border-sky-500 bg-white dark:bg-slate-900"
      : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      onClick={onOpen}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={`${format(new Date(`${date}T00:00`), "EEEE d MMMM")}: ${workout.name ?? "Workout"}. Hold to move`}
      style={{ WebkitTouchCallout: "none", touchAction: "manipulation" }}
      className={`min-w-0 flex-1 select-none text-left ${flash ? "rounded-2xl ring-4 ring-sky-500/25" : ""}`}
    >
      <CardBody workout={workout} className={border} />
    </button>
  );
}

/** The card's face: name, progress, exercise list and grip. Shared by the row and the drag overlay. */
function CardBody({ workout, className }: { workout: Workout; className: string }) {
  const total = workout.exercises.length;
  const done = doneCount(workout);
  const marked = anyMarked(workout);
  return (
    <span className={`flex items-center gap-2.5 rounded-2xl border-[1.5px] px-3 py-2.5 ${className}`}>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold">{workout.name ?? "Workout"}</span>
          <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
            {marked ? `${done}/${total} done` : `${total} exercise${total === 1 ? "" : "s"}`}
          </span>
        </span>
        {marked && (
          <span className="block h-1 rounded-full bg-slate-200 dark:bg-slate-700">
            <span
              className="block h-1 rounded-full bg-sky-500"
              style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }}
            />
          </span>
        )}
        {total > 0 && (
          <span className="truncate text-xs text-slate-500 dark:text-slate-400">{exerciseLine(workout)}</span>
        )}
      </span>
      <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true" className="shrink-0 fill-slate-400 dark:fill-slate-500">
        {[4, 10, 16].map((y) => (
          <g key={y}>
            <circle cx="4" cy={y} r="1.6" />
            <circle cx="10" cy={y} r="1.6" />
          </g>
        ))}
      </svg>
    </span>
  );
}

/** A drop zone pinned to the top or bottom of the screen that flips the week when held. */
function EdgeStrip({ id, label }: { id: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const top = id === EDGE_PREV;
  return (
    <div
      ref={setNodeRef}
      className={`fixed inset-x-0 z-30 flex h-12 items-center justify-center border-dashed text-xs font-medium ${
        top ? "border-b" : "border-t"
      } ${
        isOver
          ? "border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100"
          : "border-slate-300 bg-slate-100/95 text-slate-500 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-400"
      }`}
      style={
        top
          ? { top: "env(safe-area-inset-top, 0px)" }
          : { bottom: "calc(env(safe-area-inset-bottom, 0px) + 3.5rem)" }
      }
    >
      {label}
    </div>
  );
}
