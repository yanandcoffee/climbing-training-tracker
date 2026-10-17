import type AnthropicType from "@anthropic-ai/sdk";
import type { ExerciseCategory, MeasureType, Settings, WeightUnit } from "../types";
import { apiKeyFor, modelFor, providerOf, PROVIDERS } from "./providers";

/** One exercise as written in the coach's note, with this session's prescription. */
export interface ParsedItem {
  name: string;
  group?: string; // sub-heading it sits under, e.g. "TFCC warm up"
  category: ExerciseCategory;
  measureType: MeasureType;
  sets?: number;
  reps?: number;
  windowSec?: number;
  holdSec?: number;
  restSec?: number;
  weight?: number; // > 0 added, 0 bodyweight, < 0 assisted
  weightUnit?: WeightUnit;
  notes?: string;
}

export interface ParsedSection {
  title: string;
  notes: string[]; // focus cues / instructions that aren't exercises
  items: ParsedItem[];
}

/** A whole workout, in the coach's order. */
export interface ParsedPlan {
  workoutName: string;
  sections: ParsedSection[];
}

const CATEGORIES: ExerciseCategory[] = [
  "warm_up",
  "on_wall_drills",
  "strength_conditioning",
  "core",
  "mobility",
];
const MEASURES: MeasureType[] = ["reps", "reps_in_time", "hold", "intervals", "duration", "check"];
const UNITS: WeightUnit[] = ["lb", "kg"];

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "category", "measureType"],
  properties: {
    name: { type: "string" },
    group: { type: "string" },
    category: { type: "string", enum: CATEGORIES },
    measureType: { type: "string", enum: MEASURES },
    sets: { type: "number" },
    reps: { type: "number" },
    windowSec: { type: "number" },
    holdSec: { type: "number" },
    restSec: { type: "number" },
    weight: { type: "number" },
    weightUnit: { type: "string", enum: UNITS },
    notes: { type: "string" },
  },
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["workoutName", "sections"],
  properties: {
    workoutName: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "notes", "items"],
        properties: {
          title: { type: "string" },
          notes: { type: "array", items: { type: "string" } },
          items: { type: "array", items: ITEM_SCHEMA },
        },
      },
    },
  },
} as const;

// Used for OpenAI json_object mode, which doesn't enforce a schema server-side.
const JSON_SHAPE_HINT = {
  workoutName: "string",
  sections: [
    {
      title: "string",
      notes: ["string"],
      items: [
        {
          name: "string",
          group: "string (optional)",
          category: `one of ${CATEGORIES.join(" | ")}`,
          measureType: `one of ${MEASURES.join(" | ")}`,
          sets: "number (optional)",
          reps: "number (optional)",
          windowSec: "number (optional)",
          holdSec: "number (optional)",
          restSec: "number (optional)",
          weight: "number (optional; negative = assisted, 0 = bodyweight)",
          weightUnit: "lb | kg (optional)",
          notes: "string (optional)",
        },
      ],
    },
  ],
};

const JSON_ONLY = `Return ONLY a JSON object with this exact shape: ${JSON.stringify(JSON_SHAPE_HINT)}`;

const SYSTEM = `You convert a climbing coach's free-form session note into one structured workout, preserving the coach's order and structure.

Structure:
- Top-level headings in the note (e.g. "Pre Climbing", "Climbing", "Post Climbing exercise") become sections, in order. Keep the coach's wording for titles.
- A sub-heading inside a section that groups several exercises (e.g. "warm up", "TFCC warm up", "Ground finger warm up (on 10mm)") is the "group" of each exercise under it — not an exercise itself. If an exercise sits under nested sub-headings, use the most specific one.
- Lines that are instructions or focus cues rather than exercises to perform (e.g. "Focus on Rhythm", technique reminders) go in that section's "notes", verbatim. A section may have only notes.

Each exercise ("item"):
- name: a clean, reusable exercise name, without the sets/reps/weight (e.g. "Three finger full extension", "Shoulder shrug"). If the user message lists existing exercises and the item is the same exercise, use that exact existing name — even if the note words it differently (e.g. "Shrugs" vs "Shoulder Shrug").
- category: warm_up (anything done to prepare before climbing or lifting — warm-up sets, finger/wrist/forearm activation such as TFCC work, band warm-ups, easy movement; judge by the exercise's purpose and any warm-up heading it sits under), on_wall_drills (movement drills on the wall, including on-wall warm-up climbing drills only if they train a specific climbing skill), strength_conditioning (off-the-wall strength/power, hangboard/finger loading, pulls), core (trunk/tension), mobility (stretching, range-of-motion and prehab work that isn't a warm-up).
- measureType + numbers:
  - reps: sets x reps ("2 set of 10" → sets 2, reps 10)
  - hold: timed hold ("3 set 10 sec" → sets 3, holdSec 10)
  - intervals: work/rest repeats, e.g. repeaters ("7s on 3s off x5" or "7/3 for 5 sets" → sets 5, holdSec 7, restSec 3; "3 sets of 6 reps 7 on 3 off" → sets 3, reps 6, holdSec 7, restSec 3)
  - reps_in_time: max reps in a time window (windowSec, sets)
  - duration: a timed activity (holdSec = total seconds)
  - check: no sets/reps/time given — just do it
- weight + weightUnit when a load is given. Positive = added weight ("11.25lbs", "+10 lb" → weight 11.25 / 10). 0 = bodyweight ("BW", "bodyweight", "no added weight"). Negative = assisted, e.g. with a harness and pulley or counterweight ("-15 lb", "15 lb assisted", "pulley 15lb off" → weight -15).
- notes: any per-exercise detail that doesn't fit the fields (e.g. "full crimp").

Only include fields you can infer. workoutName: a short descriptive name for the session.`;

/** Dispatches to the configured AI provider (Anthropic, OpenAI or Gemini). */
export async function parseNotes(
  text: string,
  settings: Settings,
  existingExerciseNames: string[] = [],
): Promise<ParsedPlan> {
  if (!text.trim()) throw new Error("Paste the coach's note first.");
  const prompt = existingExerciseNames.length
    ? `Existing exercises (reuse these exact names for the same exercise):\n${existingExerciseNames
        .map((n) => `- ${n}`)
        .join("\n")}\n\nCoach's note:\n${text}`
    : `Coach's note:\n${text}`;
  const provider = providerOf(settings);
  const apiKey = apiKeyFor(settings, provider);
  if (!apiKey) throw new Error(`Add your ${provider.company} API key in Settings first.`);
  const model = modelFor(settings, provider);
  if (provider.id === "openai") return parseWithOpenAI(prompt, apiKey, model);
  if (provider.id === "gemini") return parseWithGemini(prompt, apiKey, model);
  return parseWithAnthropic(prompt, apiKey, model);
}

async function parseWithAnthropic(
  text: string,
  apiKey: string,
  model: string,
): Promise<ParsedPlan> {
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
): Promise<ParsedPlan> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  let content: string | null;
  try {
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${SYSTEM}\n\n${JSON_ONLY}` },
        { role: "user", content: text },
      ],
    });
    content = completion.choices[0]?.message?.content ?? null;
  } catch (err) {
    throw new Error(openAiError(err));
  }
  return parseJson(content ?? "");
}

type GeminiPart = { text?: string; thought?: boolean };
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string; details?: { reason?: string }[] };
}

/** Wait before retrying a busy Gemini model (tests set this to 0). */
export const geminiRetry = { delayMs: 2000 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Google Gemini, with resilience for the free tier: a busy model (5xx) is
 * retried once, then — like a rate-limited one (429, limits are per model) —
 * the other Gemini models are tried in turn.
 */
async function parseWithGemini(
  text: string,
  apiKey: string,
  model: string,
): Promise<ParsedPlan> {
  const models = [model, ...PROVIDERS.gemini.models.map((m) => m.id).filter((m) => m !== model)];
  let last = { status: 0, body: {} as GeminiResponse };
  for (const m of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { res, body } = await callGemini(text, apiKey, m);
      if (res.ok) return readGemini(body);
      last = { status: res.status, body };
      const busy = res.status >= 500;
      if (!busy) break; // only a busy model is worth retrying as-is
      if (attempt === 0) await sleep(geminiRetry.delayMs);
    }
    // Move on to the next model only for capacity problems; anything else
    // (bad key, blocked note, …) would fail the same way everywhere.
    if (!(last.status >= 500 || last.status === 429)) break;
  }
  if (last.status >= 500) {
    throw new Error(
      `Gemini is overloaded right now (${last.status}) — tried ${models.length} model${models.length > 1 ? "s" : ""}, twice each. Wait a minute and try again, or switch provider.`,
    );
  }
  throw new Error(geminiError(last.status, last.body));
}

/** Gemini's REST API (no SDK): JSON mode plus the shape hint; sanitizePlan validates. */
async function callGemini(text: string, apiKey: string, model: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const call = async (jsonMode: boolean) => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${SYSTEM}\n\n${JSON_ONLY}` }] },
          contents: [{ role: "user", parts: [{ text }] }],
          ...(jsonMode ? { generationConfig: { responseMimeType: "application/json" } } : {}),
        }),
      });
    } catch {
      throw new Error("Network error reaching Google Gemini. Check your connection.");
    }
    const body = (await res.json().catch(() => ({}))) as GeminiResponse;
    return { res, body };
  };

  let { res, body } = await call(true);
  // If Google ever stops accepting the JSON-mode field, fall back to the prompt alone.
  if (res.status === 400 && /unknown name|invalid json payload/i.test(body.error?.message ?? "")) {
    ({ res, body } = await call(false));
  }
  return { res, body };
}

function readGemini(body: GeminiResponse): ParsedPlan {
  if (body.promptFeedback?.blockReason) {
    throw new Error(`Gemini declined to read this note (${body.promptFeedback.blockReason}). Try editing it, or build the workout by hand.`);
  }
  const cand = body.candidates?.[0];
  const out = (cand?.content?.parts ?? [])
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
  if (!out && cand?.finishReason && cand.finishReason !== "STOP") {
    throw new Error(`Gemini stopped without an answer (${cand.finishReason}). Try again or try another model.`);
  }
  if (cand?.finishReason === "MAX_TOKENS") {
    throw new Error("Gemini's answer was cut off — the note may be too long. Try splitting it.");
  }
  return parseJson(out);
}

export function geminiError(status: number, body: GeminiResponse): string {
  const message = body.error?.message ?? "";
  const keyInvalid =
    /api key not valid|api_key_invalid/i.test(message) ||
    !!body.error?.details?.some((d) => d.reason === "API_KEY_INVALID");
  if (keyInvalid || status === 401) return "Your Gemini API key was rejected. Check it in Settings.";
  if (status === 403) return "This Gemini key can't use that model (403). Check the key or pick another model.";
  if (status === 404) return "That Gemini model wasn't found (404). Pick another in Settings.";
  if (status === 429) {
    return "Gemini free-tier limit reached — it allows a limited number of requests per minute and per day. Wait a minute (or until tomorrow if it's the daily limit) and try again.";
  }
  if (status >= 500) return `Gemini is having trouble right now (${status}). Try again in a moment.`;
  return `Gemini error: ${message || `HTTP ${status}`}`;
}

function parseJson(raw: string): ParsedPlan {
  let data: unknown;
  // Tolerate a ```json fence around the object (models without JSON mode do this).
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new Error("Could not read the model's response. Please try again.");
  }
  return sanitizePlan(data);
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Validate/clean a model response into a ParsedPlan (defensive: OpenAI JSON mode isn't schema-enforced). */
export function sanitizePlan(raw: unknown): ParsedPlan {
  const data = (raw ?? {}) as { workoutName?: unknown; sections?: unknown };
  const sections: ParsedSection[] = (Array.isArray(data.sections) ? data.sections : [])
    .map((sec: { title?: unknown; notes?: unknown; items?: unknown }) => ({
      title: str(sec?.title) || "Workout",
      notes: (Array.isArray(sec?.notes) ? sec.notes : []).map(str).filter(Boolean),
      items: (Array.isArray(sec?.items) ? sec.items : [])
        .filter((e: { name?: unknown }) => str(e?.name))
        .map((e: Record<string, unknown>): ParsedItem => {
          const measureType = MEASURES.includes(e.measureType as MeasureType)
            ? (e.measureType as MeasureType)
            : "check";
          const weight = numOrUndef(e.weight);
          return {
            name: str(e.name),
            group: str(e.group) || undefined,
            category: CATEGORIES.includes(e.category as ExerciseCategory)
              ? (e.category as ExerciseCategory)
              : "strength_conditioning",
            measureType,
            sets: numOrUndef(e.sets),
            reps: numOrUndef(e.reps),
            windowSec: numOrUndef(e.windowSec),
            holdSec: numOrUndef(e.holdSec),
            restSec: numOrUndef(e.restSec),
            weight,
            weightUnit:
              weight == null
                ? undefined
                : UNITS.includes(e.weightUnit as WeightUnit)
                  ? (e.weightUnit as WeightUnit)
                  : "lb",
            notes: str(e.notes) || undefined,
          };
        }),
    }))
    .filter((sec) => sec.items.length || sec.notes.length);
  return { workoutName: str(data.workoutName) || "Imported workout", sections };
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
  if (status === 429) {
    // OpenAI uses 429 both for "out of credit" and for real rate limiting.
    const code = (err as { code?: string; error?: { code?: string } })?.code
      ?? (err as { error?: { code?: string } })?.error?.code;
    if (code === "insufficient_quota") {
      return "Your OpenAI account has no API credit. API billing is separate from a ChatGPT subscription — add credit at platform.openai.com → Settings → Billing, then try again.";
    }
    return "OpenAI rate limit hit — wait a minute and try again.";
  }
  const msg = err instanceof Error ? err.message : "Unknown error.";
  return `OpenAI error: ${msg}`;
}
