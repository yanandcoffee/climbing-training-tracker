// Core domain model for Break Your Plateau.
// Every persisted record carries id/updatedAt/deletedAt so a future cloud
// backend can do last-write-wins merge + delete propagation (see Synced below).

export interface Synced {
  id: string;
  updatedAt: number; // epoch ms
  deletedAt?: number; // soft-delete tombstone
}

export type DayColor = "green" | "yellow" | "orange" | "red" | "black";

export interface CheckIn extends Synced {
  date: string; // 'YYYY-MM-DD'
  color: DayColor;
  quality: number; // position within the color's band (see scoring.ts)
  points: number; // resolved readiness points
  note?: string;
}

export type ExerciseCategory =
  | "warm_up"
  | "on_wall_drills"
  | "strength_conditioning"
  | "core"
  | "mobility";

/**
 * How a workout item is prescribed/logged. "check" = no numeric target, just
 * do it (e.g. a warm-up stretch). "intervals" = work/rest repeats, e.g. 7s on /
 * 3s off (holdSec on, restSec off, optional reps per set for repeaters).
 */
export type MeasureType = "reps" | "reps_in_time" | "hold" | "intervals" | "duration" | "check";

/** Order the measure types are offered in pickers. */
export const MEASURE_ORDER: MeasureType[] = ["reps", "hold", "intervals", "reps_in_time", "duration", "check"];

/**
 * A building block. Holds no sets/reps — those belong to each workout it's
 * used in (see WorkoutExercise.prescription), so the same exercise can
 * progress week to week.
 */
export interface Exercise extends Synced {
  name: string;
  category: ExerciseCategory;
  /** The usual way it's measured; each workout can override it. */
  measureType: MeasureType;
  description?: string; // cues
  mediaUrl?: string; // reference image/video to confirm form
  mediaType?: "image" | "video";
}

export type ExerciseStatus = "none" | "complete" | "partial" | "skipped";

export interface Prescription {
  sets?: number;
  reps?: number;
  windowSec?: number; // reps_in_time window
  holdSec?: number; // hold/duration target; "on" time for intervals
  restSec?: number; // "off" time for intervals
  /**
   * Load: > 0 added weight, 0 bodyweight, < 0 assisted (harness + pulley
   * counterweight). undefined = no load given.
   */
  weight?: number;
  weightUnit?: WeightUnit;
}

export type WeightUnit = "lb" | "kg";

/** What was done in one set. */
export interface SetResult {
  reps?: number;
  weight?: number; // signed load, as Prescription.weight
  durationSec?: number; // seconds held / done
}

export interface Metrics {
  /** Per-set results (new). */
  sets?: SetResult[];
  // Single-result fields: written by older versions as the one result for the
  // whole exercise; still read, and used as the chart value when sets exist.
  reps?: number;
  weight?: number;
  durationSec?: number;
  rpe?: number; // rate of perceived exertion 1-10 (whole exercise)
}

export interface WorkoutExercise {
  id: string;
  exerciseId?: string; // links back to the library item for trends
  sectionId?: string; // which WorkoutSection it belongs to
  group?: string; // optional sub-heading within the section, e.g. "TFCC warm up"
  name: string;
  category: ExerciseCategory;
  measureType: MeasureType;
  prescription?: Prescription;
  notes?: string;
  status: ExerciseStatus;
  metrics?: Metrics; // what you actually did
}

/** A titled part of a workout, e.g. "Pre Climbing", with optional focus cues. */
export interface WorkoutSection {
  id: string;
  title: string;
  notes?: string[];
}

export interface Workout extends Synced {
  date: string; // 'YYYY-MM-DD'
  name?: string;
  /** Section order + titles + cues. Items reference these by sectionId. */
  sections?: WorkoutSection[];
  exercises: WorkoutExercise[];
}

// ---- Retired: workout templates + weekly schedule ------------------------
// No longer used by the UI (planning happens per day in the calendar). Kept so
// previously stored/synced data still loads.
export type TemplateExercise = Omit<WorkoutExercise, "status" | "metrics">;

export interface WorkoutTemplate extends Synced {
  name: string;
  exercises: TemplateExercise[];
}

export interface ScheduleEntry extends Synced {
  templateId: string;
  weekday?: number; // 0 (Sun) - 6 (Sat); recurring
  date?: string; // 'YYYY-MM-DD'; one-off (wins over weekday)
}

export interface SyncConfig {
  enabled: boolean;
  provider?: "supabase";
  // room for url / anon key / userId when sync is implemented
}

export type AIProvider = "anthropic" | "openai" | "gemini";

export interface Settings {
  provider: AIProvider;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  anthropicModel: string;
  openaiModel: string;
  geminiModel?: string;
  sync?: SyncConfig;
  /**
   * Save provider/models/API keys to the signed-in Supabase account.
   * undefined = never chosen on this device (joins the account's choice);
   * false = explicitly turned off here.
   */
  syncApiKeys?: boolean;
  /** Epoch ms of the last local change to the synced AI settings. */
  settingsUpdatedAt?: number;
}

export interface Snapshot {
  version: number;
  checkIns: CheckIn[];
  exercises: Exercise[];
  workouts: Workout[];
  templates: WorkoutTemplate[];
  schedule: ScheduleEntry[];
  settings: Settings;
}

export const CATEGORY_ORDER: ExerciseCategory[] = [
  "warm_up",
  "on_wall_drills",
  "strength_conditioning",
  "core",
  "mobility",
];

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  warm_up: "Warm up",
  on_wall_drills: "On-wall climbing drills",
  strength_conditioning: "Off-the-wall strength & conditioning",
  core: "Core training",
  mobility: "Mobility work",
};

export const MEASURE_LABELS: Record<MeasureType, string> = {
  reps: "Reps / sets",
  reps_in_time: "Max reps in time window",
  hold: "Timed hold",
  intervals: "On / off intervals",
  duration: "Timed activity",
  check: "Climbing drill",
};

export const COLOR_LABELS: Record<DayColor, string> = {
  green: "Green — feeling strong",
  yellow: "Yellow — neutral",
  orange: "Orange — a bit off",
  red: "Red — rough / painful",
  black: "Black — injury",
};
