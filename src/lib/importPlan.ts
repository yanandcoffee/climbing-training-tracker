import type { Exercise, ExerciseCategory, MeasureType, WorkoutExercise, WorkoutSection } from "../types";
import type { ParsedPlan } from "./parseNotes";
import type { WorkoutBody } from "./workoutPlan";
import { uid } from "./id";

/** Mapping value meaning "create a new library exercise for this item". */
export const NEW_EXERCISE = "__new__";

export const itemKey = (sectionIndex: number, itemIndex: number) => `${sectionIndex}:${itemIndex}`;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Initial match of each parsed item to an existing exercise by name, else "new". */
export function defaultMapping(plan: ParsedPlan, library: Exercise[]): Record<string, string> {
  const byName = new Map(library.map((e) => [norm(e.name), e.id]));
  const m: Record<string, string> = {};
  plan.sections.forEach((sec, si) =>
    sec.items.forEach((it, ii) => {
      m[itemKey(si, ii)] = byName.get(norm(it.name)) ?? NEW_EXERCISE;
    }),
  );
  return m;
}

/**
 * Turn a reviewed parse into a workout. Items mapped to an existing exercise
 * link to it (keeping its history); "new" items create one library exercise
 * per distinct name via `createExercise`.
 */
export function planToBody(
  plan: ParsedPlan,
  opts: {
    name?: string;
    mapping: Record<string, string>;
    removed?: Set<string>;
    library: Exercise[];
    createExercise: (data: { name: string; category: ExerciseCategory; measureType: MeasureType }) => Exercise;
  },
): WorkoutBody {
  const libById = new Map(opts.library.map((e) => [e.id, e]));
  const created = new Map<string, Exercise>();
  const sections: WorkoutSection[] = [];
  const exercises: WorkoutExercise[] = [];

  plan.sections.forEach((sec, si) => {
    const keep = sec.items
      .map((it, ii) => ({ it, key: itemKey(si, ii) }))
      .filter(({ key }) => !opts.removed?.has(key));
    if (!keep.length && !sec.notes.length) return;

    const sectionId = uid();
    sections.push({ id: sectionId, title: sec.title, notes: sec.notes.length ? [...sec.notes] : undefined });

    for (const { it, key } of keep) {
      const mapped = opts.mapping[key];
      let ex = mapped && mapped !== NEW_EXERCISE ? libById.get(mapped) : undefined;
      if (!ex) {
        const k = norm(it.name);
        ex = created.get(k);
        if (!ex) {
          ex = opts.createExercise({ name: it.name, category: it.category, measureType: it.measureType });
          created.set(k, ex);
        }
      }
      exercises.push({
        id: uid(),
        exerciseId: ex.id,
        sectionId,
        group: it.group,
        name: ex.name,
        category: ex.category,
        measureType: it.measureType,
        prescription: {
          sets: it.sets,
          reps: it.reps,
          windowSec: it.windowSec,
          holdSec: it.holdSec,
          weight: it.weight,
          weightUnit: it.weightUnit,
        },
        notes: it.notes,
        status: "none",
      });
    }
  });

  return { name: opts.name?.trim() || plan.workoutName || undefined, sections, exercises };
}
