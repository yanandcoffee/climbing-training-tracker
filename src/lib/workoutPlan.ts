import type {
  Exercise,
  MeasureType,
  Prescription,
  Workout,
  WorkoutExercise,
  WorkoutSection,
} from "../types";
import { uid } from "./id";

/** The content of a workout, independent of its date: what gets imported or copied. */
export interface WorkoutBody {
  name?: string;
  sections: WorkoutSection[];
  exercises: WorkoutExercise[];
}

export const isEmptyWorkout = (w: Pick<Workout, "exercises" | "sections"> | undefined) =>
  !w || (w.exercises.length === 0 && (w.sections ?? []).every((s) => !s.notes?.length));

/**
 * A fresh copy of a workout's content: new ids, sections re-linked, and
 * progress (status + logged metrics) cleared — prescriptions are kept.
 */
export function freshCopy(body: WorkoutBody): WorkoutBody {
  const idMap = new Map<string, string>();
  const sections = body.sections.map((s) => {
    const id = uid();
    idMap.set(s.id, id);
    return { ...s, id, notes: s.notes ? [...s.notes] : undefined };
  });
  const exercises = body.exercises.map((e) => {
    const { metrics: _metrics, ...rest } = e;
    void _metrics;
    return {
      ...rest,
      id: uid(),
      sectionId: e.sectionId ? idMap.get(e.sectionId) : undefined,
      prescription: e.prescription ? { ...e.prescription } : undefined,
      status: "none" as const,
    };
  });
  return { name: body.name, sections, exercises };
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Put `body` onto an existing workout.
 *  - replace: the existing content is discarded.
 *  - append: sections with the same title are merged (items + cues added).
 */
export function mergeBody(
  existing: WorkoutBody,
  incoming: WorkoutBody,
  mode: "replace" | "append",
): WorkoutBody {
  const fresh = freshCopy(incoming);
  if (mode === "replace" || isEmptyWorkout(existing)) return fresh;

  const sections: WorkoutSection[] = existing.sections.map((s) => ({
    ...s,
    notes: s.notes ? [...s.notes] : undefined,
  }));
  const remap = new Map<string, string>();
  for (const s of fresh.sections) {
    const match = sections.find((x) => norm(x.title) === norm(s.title));
    if (match) {
      remap.set(s.id, match.id);
      const notes = [...(match.notes ?? [])];
      for (const n of s.notes ?? []) if (!notes.includes(n)) notes.push(n);
      match.notes = notes.length ? notes : undefined;
    } else {
      sections.push(s);
    }
  }
  const added = fresh.exercises.map((e) => ({
    ...e,
    sectionId: e.sectionId ? (remap.get(e.sectionId) ?? e.sectionId) : undefined,
  }));
  return {
    name: existing.name ?? fresh.name,
    sections,
    exercises: [...existing.exercises, ...added],
  };
}

export interface LastUse {
  date: string;
  measureType: MeasureType;
  prescription?: Prescription;
}

/** The most recent time this exercise was planned, on or before `onOrBefore` if given. */
export function lastUseOf(
  workouts: Workout[],
  exerciseId: string,
  onOrBefore?: string,
): LastUse | undefined {
  let best: LastUse | undefined;
  for (const w of workouts) {
    if (w.deletedAt || (onOrBefore && w.date > onOrBefore)) continue;
    if (best && w.date <= best.date) continue;
    const item = [...w.exercises].reverse().find((e) => e.exerciseId === exerciseId);
    if (item) best = { date: w.date, measureType: item.measureType, prescription: item.prescription };
  }
  return best;
}

/** A new workout item for a library exercise, pre-filled from the last time it was done. */
export function itemFromExercise(
  ex: Exercise,
  workouts: Workout[],
  date: string,
  sectionId?: string,
): WorkoutExercise {
  // Prefer the latest use before this date; fall back to any use (e.g. planning ahead).
  const last = lastUseOf(workouts, ex.id, date) ?? lastUseOf(workouts, ex.id);
  return {
    id: uid(),
    exerciseId: ex.id,
    sectionId,
    name: ex.name,
    category: ex.category,
    measureType: last?.measureType ?? ex.measureType,
    prescription: last?.prescription ? { ...last.prescription } : undefined,
    status: "none",
  };
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));

/** Human summary of a prescription, e.g. "2 × 10", "3 × 10s hold @ 11.25 lb". */
export function prescriptionSummary(measureType: MeasureType, p: Prescription | undefined): string {
  const pr = p ?? {};
  const sets = pr.sets;
  const setsX = sets ? `${sets} × ` : "";
  const weight = pr.weight != null ? ` @ ${fmtNum(pr.weight)} ${pr.weightUnit ?? "lb"}` : "";
  let core = "";
  switch (measureType) {
    case "reps":
      core = pr.reps ? `${setsX}${pr.reps}` : sets ? `${sets} set${sets > 1 ? "s" : ""}` : "";
      break;
    case "reps_in_time":
      core = `${setsX}max reps / ${pr.windowSec ?? "?"}s`;
      break;
    case "hold":
      core = pr.holdSec ? `${setsX}${pr.holdSec}s hold` : sets ? `${sets} sets` : "";
      break;
    case "duration":
      core = pr.holdSec
        ? pr.holdSec >= 60 && pr.holdSec % 60 === 0
          ? `${setsX}${pr.holdSec / 60} min`
          : `${setsX}${pr.holdSec}s`
        : "";
      break;
    case "check":
      core = "";
      break;
  }
  return `${core}${weight}`.trim();
}

export type ItemGroup = { group?: string; items: WorkoutExercise[] };

/** Consecutive items sharing a `group` sub-heading are rendered together. */
export function groupItems(items: WorkoutExercise[]): ItemGroup[] {
  const out: ItemGroup[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && (last.group ?? "") === (it.group ?? "")) last.items.push(it);
    else out.push({ group: it.group, items: [it] });
  }
  return out;
}
