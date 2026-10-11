// Core domain model for the Climbing Training Tracker.
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
  | "on_wall_drills"
  | "strength_conditioning"
  | "core"
  | "mobility";

export type MeasureType = "reps" | "reps_in_time" | "hold" | "duration";

export interface Exercise extends Synced {
  name: string;
  category: ExerciseCategory;
  measureType: MeasureType;
  description?: string;
  defaultSets?: number;
  defaultReps?: number;
  defaultWindowSec?: number; // for reps_in_time (e.g. 10s window)
  defaultHoldSec?: number; // for hold/duration targets
  mediaUrl?: string; // reference image/video to confirm form
  mediaType?: "image" | "video";
}

export type ExerciseStatus = "none" | "complete" | "partial" | "skipped";

export interface Prescription {
  sets?: number;
  reps?: number;
  windowSec?: number; // reps_in_time window
  holdSec?: number; // hold/duration target
  weight?: number;
}

export interface Metrics {
  reps?: number;
  weight?: number;
  rpe?: number; // rate of perceived exertion 1-10
  durationSec?: number; // seconds held / done
}

export interface WorkoutExercise {
  id: string;
  exerciseId?: string; // links back to the library item for trends
  name: string;
  category: ExerciseCategory;
  measureType: MeasureType;
  prescription?: Prescription;
  notes?: string;
  status: ExerciseStatus;
  metrics?: Metrics; // what you actually did
}

export interface Workout extends Synced {
  date: string; // 'YYYY-MM-DD'
  name?: string;
  exercises: WorkoutExercise[];
}

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

export type AIProvider = "anthropic" | "openai";

export interface Settings {
  provider: AIProvider;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  anthropicModel: string;
  openaiModel: string;
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
  "on_wall_drills",
  "strength_conditioning",
  "core",
  "mobility",
];

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  on_wall_drills: "On-wall climbing drills",
  strength_conditioning: "Off-the-wall strength & conditioning",
  core: "Core training",
  mobility: "Mobility work",
};

export const MEASURE_LABELS: Record<MeasureType, string> = {
  reps: "Reps / sets",
  reps_in_time: "Max reps in time window",
  hold: "Timed hold",
  duration: "Timed activity",
};

export const COLOR_LABELS: Record<DayColor, string> = {
  green: "Green — feeling strong",
  yellow: "Yellow — neutral",
  orange: "Orange — a bit off",
  red: "Red — rough / painful",
  black: "Black — injury",
};
