import type {
  Exercise,
  ExerciseCategory,
  MeasureType,
  Prescription,
  Workout,
  WorkoutExercise,
  WorkoutSection,
} from "../types";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../types";
import { uid } from "./id";
import { hasLogged, loadLabel, targetLoad } from "./history";

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

type Named = Pick<WorkoutExercise, "exerciseId" | "name">;

/** Same exercise: by library link when both have one, else by name. */
const sameExercise = (a: Named, b: Named) =>
  a.exerciseId && b.exerciseId ? a.exerciseId === b.exerciseId : norm(a.name) === norm(b.name);

/**
 * Which incoming items are already on the day: incoming index → existing index.
 * Each existing item matches at most once, so an exercise the note lists twice
 * is only skipped once.
 */
export function matchExisting(existing: Named[], incoming: Named[]): Map<number, number> {
  const used = new Set<number>();
  const out = new Map<number, number>();
  incoming.forEach((inc, ii) => {
    const ei = existing.findIndex((e, i) => !used.has(i) && sameExercise(e, inc));
    if (ei >= 0) {
      used.add(ei);
      out.set(ii, ei);
    }
  });
  return out;
}

/** Whether an item has been marked or logged — work that replacing would throw away. */
export const hasProgress = (e: WorkoutExercise) => e.status !== "none" || hasLogged(e.metrics);

export type MergeMode = "replace" | "append";

/** Days with logged progress default to "Add to it", so nothing done is lost by accident. */
export const defaultMergeMode = (existing: Pick<Workout, "exercises">[]): MergeMode =>
  existing.some((w) => w.exercises.some(hasProgress)) ? "append" : "replace";

const hasTarget = (p: Prescription | undefined) =>
  !!p && [p.sets, p.reps, p.windowSec, p.holdSec, p.restSec, p.weight].some((v) => v != null);

/**
 * Put `body` onto an existing workout.
 *  - replace: the existing content is discarded.
 *  - append: sections with the same title are merged (items + cues added).
 *    Exercises the day already has are kept as they are, not added twice; a
 *    kept one with no target yet (and nothing logged) takes the incoming target.
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
  const matches = matchExisting(existing.exercises, fresh.exercises);
  const kept = existing.exercises.map((e) => ({ ...e }));
  for (const [ii, ei] of matches) {
    const mine = kept[ei];
    const inc = fresh.exercises[ii];
    if (!hasTarget(mine.prescription) && hasTarget(inc.prescription) && !hasProgress(mine)) {
      kept[ei] = { ...mine, measureType: inc.measureType, prescription: inc.prescription };
    }
    if (!mine.notes && inc.notes) kept[ei] = { ...kept[ei], notes: inc.notes };
  }
  const added = fresh.exercises
    .filter((_, i) => !matches.has(i))
    .map((e) => ({
      ...e,
      sectionId: e.sectionId ? (remap.get(e.sectionId) ?? e.sectionId) : undefined,
    }));
  // A new section left with nothing in it (all its exercises were already here) is dropped.
  const existingIds = new Set(existing.sections.map((s) => s.id));
  const finalSections = sections.filter(
    (s) => existingIds.has(s.id) || s.notes?.length || added.some((e) => e.sectionId === s.id),
  );
  return {
    name: existing.name ?? fresh.name,
    sections: finalSections,
    exercises: [...kept, ...added],
  };
}

/** The section with this title (case-insensitive), if any. */
export function findSectionByTitle(sections: WorkoutSection[], title: string): WorkoutSection | undefined {
  return sections.find((s) => norm(s.title) === norm(title));
}

/**
 * Merge sections that share a title (case-insensitive): the first one is kept
 * and gets the others' items and cues. Returns null when there's nothing to merge.
 */
export function mergeDuplicateSections<T extends WorkoutBody>(body: T): T | null {
  const keep: WorkoutSection[] = [];
  const remap = new Map<string, string>();
  for (const s of body.sections) {
    const match = keep.find((k) => norm(k.title) === norm(s.title));
    if (!match) {
      keep.push({ ...s });
      continue;
    }
    remap.set(s.id, match.id);
    const notes = [...(match.notes ?? [])];
    for (const n of s.notes ?? []) if (!notes.includes(n)) notes.push(n);
    match.notes = notes.length ? notes : undefined;
  }
  if (!remap.size) return null;
  return {
    ...body,
    sections: keep,
    exercises: body.exercises.map((e) =>
      e.sectionId && remap.has(e.sectionId) ? { ...e, sectionId: remap.get(e.sectionId) } : e,
    ),
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

/**
 * Human summary of a prescription, e.g. "2 × 10", "3 × 10s hold @ 11.25 lb",
 * "5 × 7s on / 3s off @ bodyweight".
 */
export function prescriptionSummary(measureType: MeasureType, p: Prescription | undefined): string {
  const pr = p ?? {};
  const sets = pr.sets;
  const setsX = sets ? `${sets} × ` : "";
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
    case "intervals": {
      const onOff =
        pr.holdSec != null || pr.restSec != null ? `${pr.holdSec ?? "?"}s on / ${pr.restSec ?? "?"}s off` : "";
      core = pr.reps
        ? `${sets ? `${sets} sets × ` : ""}${pr.reps} reps${onOff ? ` · ${onOff}` : ""}`
        : onOff
          ? `${setsX}${onOff}`
          : sets
            ? `${sets} sets`
            : "";
      break;
    }
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
  // An implied bodyweight (intervals with no load set) only rides along with a target.
  const load = targetLoad(measureType, p);
  const weight = load != null && (pr.weight != null || core) ? ` @ ${loadLabel(load, pr.weightUnit)}` : "";
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

/** A section title not used yet in this workout: "Section 1", "Section 2", … */
export function nextSectionTitle(sections: WorkoutSection[]): string {
  let n = sections.length + 1;
  while (findSectionByTitle(sections, `Section ${n}`)) n++;
  return `Section ${n}`;
}

const categoryRank = (title: string) =>
  CATEGORY_ORDER.findIndex((c) => norm(CATEGORY_LABELS[c]) === norm(title));

/**
 * The section named after a category (e.g. "Warm up"), where exercises go by
 * default. Creates it if missing, placed in category order among the other
 * category-named sections.
 */
export function sectionForCategory(
  sections: WorkoutSection[],
  category: ExerciseCategory,
): { sections: WorkoutSection[]; id: string } {
  const title = CATEGORY_LABELS[category];
  const found = findSectionByTitle(sections, title);
  if (found) return { sections, id: found.id };
  const created = { id: uid(), title };
  const rank = CATEGORY_ORDER.indexOf(category);
  const at = sections.findIndex((s) => categoryRank(s.title) > rank);
  const next = at < 0 ? [...sections, created] : [...sections.slice(0, at), created, ...sections.slice(at)];
  return { sections: next, id: created.id };
}

/**
 * Put exercises that aren't in a section into the section for their category.
 * Returns the body unchanged when every exercise already has a section.
 */
export function sectionByCategory<T extends WorkoutBody>(body: T): T {
  let sections = body.sections;
  const valid = new Set(sections.map((s) => s.id));
  if (body.exercises.every((e) => e.sectionId && valid.has(e.sectionId))) return body;
  const exercises = body.exercises.map((e) => {
    if (e.sectionId && valid.has(e.sectionId)) return e;
    const r = sectionForCategory(sections, e.category);
    sections = r.sections;
    return { ...e, sectionId: r.id };
  });
  return { ...body, sections, exercises };
}

/** The section an item is shown in ("" for none, including a missing section). */
export function containerOf(item: WorkoutExercise, sections: WorkoutSection[]): string {
  return item.sectionId && sections.some((s) => s.id === item.sectionId) ? item.sectionId : "";
}

/**
 * Move an item to position `index` among `container`'s items ("" = no section),
 * e.g. after a drag and drop. Dropped inside a run of one sub-heading group, it
 * joins that group; otherwise it keeps its own.
 */
export function moveItemTo(
  items: WorkoutExercise[],
  sections: WorkoutSection[],
  id: string,
  container: string,
  index: number,
  { regroup = true }: { regroup?: boolean } = {},
): WorkoutExercise[] {
  const item = items.find((e) => e.id === id);
  if (!item) return items;
  const rest = items.filter((e) => e.id !== id);
  const inTarget = rest.filter((e) => containerOf(e, sections) === container);
  const i = Math.max(0, Math.min(index, inTarget.length));
  const above = inTarget[i - 1];
  const below = inTarget[i];
  const group =
    regroup && above && below && (above.group ?? "") === (below.group ?? "") ? above.group : item.group;
  const moved: WorkoutExercise = { ...item, sectionId: container || undefined, group };
  const at = below
    ? rest.indexOf(below)
    : above
      ? rest.indexOf(above) + 1
      : rest.length;
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/** Move a section to position `index` in the workout's section order. */
export function moveSectionTo(sections: WorkoutSection[], id: string, index: number): WorkoutSection[] {
  const s = sections.find((x) => x.id === id);
  if (!s) return sections;
  const rest = sections.filter((x) => x.id !== id);
  const i = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, i), s, ...rest.slice(i)];
}

/** Where a deleted section's exercises go when kept: the section above, else the one below. */
export function keepTargetOf(sections: WorkoutSection[], id: string): WorkoutSection | undefined {
  const i = sections.findIndex((s) => s.id === id);
  if (i < 0) return undefined;
  return sections[i - 1] ?? sections[i + 1];
}

/**
 * Combine section `fromId` into `intoId`: its exercises move to the end of
 * `intoId` (keeping their progress), its cues are merged, and it's removed.
 * `intoId` keeps its title and position.
 */
export function combineSections<T extends WorkoutBody>(body: T, fromId: string, intoId: string): T {
  const from = body.sections.find((s) => s.id === fromId);
  const into = body.sections.find((s) => s.id === intoId);
  if (!from || !into || fromId === intoId) return body;
  const moved = body.exercises.filter((e) => e.sectionId === fromId).map((e) => ({ ...e, sectionId: intoId }));
  const others = body.exercises.filter((e) => e.sectionId !== fromId);
  let at = others.length;
  for (let i = others.length - 1; i >= 0; i--) {
    if (others[i].sectionId === intoId) {
      at = i + 1;
      break;
    }
  }
  const notes = [...(into.notes ?? [])];
  for (const n of from.notes ?? []) if (!notes.includes(n)) notes.push(n);
  return {
    ...body,
    sections: body.sections
      .filter((s) => s.id !== fromId)
      .map((s) => (s.id === intoId ? { ...s, notes: notes.length ? notes : undefined } : s)),
    exercises: [...others.slice(0, at), ...moved, ...others.slice(at)],
  };
}

/**
 * Delete a section. Its exercises are deleted too, or kept and combined into
 * the section above (else below; with no other section they're left
 * unsectioned).
 */
export function deleteSection<T extends WorkoutBody>(body: T, id: string, keepExercises: boolean): T {
  const sections = body.sections.filter((s) => s.id !== id);
  if (!keepExercises) return { ...body, sections, exercises: body.exercises.filter((e) => e.sectionId !== id) };
  const target = keepTargetOf(body.sections, id);
  if (target) return combineSections(body, id, target.id);
  return {
    ...body,
    sections,
    exercises: body.exercises.map((e) => (e.sectionId === id ? { ...e, sectionId: undefined } : e)),
  };
}
