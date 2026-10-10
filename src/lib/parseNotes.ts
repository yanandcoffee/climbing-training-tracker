import type AnthropicType from "@anthropic-ai/sdk";
import type { ExerciseCategory, MeasureType, Settings } from "../types";

export interface ParsedExercise {
  name: string;
  category: ExerciseCategory;
  measureType: MeasureType;
  sets?: number;
  reps?: number;
  windowSec?: number;
  holdSec?: number;
  notes?: string;
}

export interface ParsedWorkout {
  workoutName: string;
  exercises: ParsedExercise[];
}

const CATEGORIES: ExerciseCategory[] = [
  "on_wall_drills",
  "strength_conditioning",
  "core",
  "mobility",
];
const MEASURES: MeasureType[] = ["reps", "reps_in_time", "hold", "duration"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["workoutName", "exercises"],
  properties: {
    workoutName: { type: "string" },
    exercises: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "measureType"],
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          measureType: { type: "string", enum: MEASURES },
          sets: { type: "number" },
          reps: { type: "number" },
          windowSec: { type: "number" },
          holdSec: { type: "number" },
          notes: { type: "string" },
        },
      },
    },
  },
} as const;

// Used for OpenAI json_object mode, which doesn't enforce a schema server-side.
const JSON_SHAPE_HINT = {
  workoutName: "string",
  exercises: [
    {
      name: "string",
      category: `one of ${CATEGORIES.join(" | ")}`,
      measureType: `one of ${MEASURES.join(" | ")}`,
      sets: "number (optional)",
      reps: "number (optional)",
      windowSec: "number (optional)",
      holdSec: "number (optional)",
      notes: "string (optional)",
    },
  ],
};

const SYSTEM = `You convert a climbing coach's free-form training note into a structured workout.

Classify every exercise into exactly one category:
- on_wall_drills: climbing movement on the wall (e.g. silent feet, flagging drills, limit bouldering, 4x4s, route repeats)
- strength_conditioning: off-the-wall strength/power (e.g. pull-ups, hangboard max hangs, weighted pulls, campus board, deadlifts)
- core: trunk/core work (e.g. front levers, leg raises, planks, tension work)
- mobility: warm-ups, stretching, flexibility, prehab

Infer the measureType:
- reps: classic sets x reps (fill sets and reps)
- reps_in_time: "as many reps as possible" within a time window (fill windowSec, and sets if given)
- hold: isometric hold for a target time (fill holdSec, and sets if given)
- duration: a timed activity like a traverse or mobility flow (fill holdSec as total seconds)

Only include fields you can infer. Give the workout a short descriptive name.`;

/** Dispatches to the configured AI provider (Anthropic or OpenAI). */
export async function parseNotes(
  text: string,
  settings: Settings,
): Promise<ParsedWorkout> {
  if (!text.trim()) throw new Error("Paste the coach's note first.");
  if (settings.provider === "openai") {
    if (!settings.openaiApiKey)
      throw new Error("Add your OpenAI API key in Settings first.");
    return parseWithOpenAI(text, settings.openaiApiKey, settings.openaiModel);
  }
  if (!settings.anthropicApiKey)
    throw new Error("Add your Anthropic API key in Settings first.");
  return parseWithAnthropic(text, settings.anthropicApiKey, settings.anthropicModel);
}

async function parseWithAnthropic(
  text: string,
  apiKey: string,
  model: string,
): Promise<ParsedWorkout> {
  // Lazy-load the SDK so it stays out of the initial app bundle.
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  let message: AnthropicType.Message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA as Record<string, unknown> } },
      messages: [{ role: "user", content: text }],
    });
  } catch (err) {
    throw new Error(friendlyError(err, Anthropic));
  }

  if (message.stop_reason === "refusal") {
    throw new Error("The model declined to parse this note. Try editing it, or enter the workout manually.");
  }

  const block = message.content.find((b) => b.type === "text");
  return parseJson(block && block.type === "text" ? block.text : "");
}

async function parseWithOpenAI(
  text: string,
  apiKey: string,
  model: string,
): Promise<ParsedWorkout> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  let content: string | null;
  try {
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${SYSTEM}\n\nReturn ONLY a JSON object with this exact shape: ${JSON.stringify(JSON_SHAPE_HINT)}` },
        { role: "user", content: text },
      ],
    });
    content = completion.choices[0]?.message?.content ?? null;
  } catch (err) {
    throw new Error(openAiError(err));
  }
  return parseJson(content ?? "");
}

function parseJson(raw: string): ParsedWorkout {
  let data: ParsedWorkout;
  try {
    data = JSON.parse(raw) as ParsedWorkout;
  } catch {
    throw new Error("Could not read the model's response. Please try again.");
  }
  return sanitize(data);
}

function sanitize(data: ParsedWorkout): ParsedWorkout {
  const exercises = (data.exercises ?? [])
    .filter((e) => e && e.name)
    .map((e) => ({
      name: String(e.name).trim(),
      category: CATEGORIES.includes(e.category) ? e.category : "strength_conditioning",
      measureType: MEASURES.includes(e.measureType) ? e.measureType : "reps",
      sets: numOrUndef(e.sets),
      reps: numOrUndef(e.reps),
      windowSec: numOrUndef(e.windowSec),
      holdSec: numOrUndef(e.holdSec),
      notes: e.notes ? String(e.notes).trim() : undefined,
    }));
  return {
    workoutName: (data.workoutName || "Imported workout").trim(),
    exercises,
  };
}

function numOrUndef(v: unknown): number | undefined {
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
}

function friendlyError(
  err: unknown,
  Anthropic: typeof import("@anthropic-ai/sdk").default,
): string {
  if (err instanceof Anthropic.AuthenticationError)
    return "Your API key was rejected (401). Check it in Settings.";
  if (err instanceof Anthropic.PermissionDeniedError)
    return "This API key can't access that model (403).";
  if (err instanceof Anthropic.RateLimitError)
    return "Rate limited — wait a moment and try again.";
  if (err instanceof Anthropic.APIConnectionError)
    return "Network error reaching Anthropic. Check your connection.";
  if (err instanceof Anthropic.APIError) return `API error: ${err.message}`;
  return err instanceof Error ? err.message : "Unknown error.";
}

function openAiError(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 401) return "Your OpenAI API key was rejected (401). Check it in Settings.";
  if (status === 403) return "This OpenAI key can't access that model (403).";
  if (status === 404) return "That OpenAI model wasn't found (404). Pick another in Settings.";
  if (status === 429) return "OpenAI rate limit / quota hit — wait a moment and try again.";
  const msg = err instanceof Error ? err.message : "Unknown error.";
  return `OpenAI error: ${msg}`;
}
