// Gemini provider: request shape, response parsing and error messages, with a
// fake fetch standing in for Google's API.
import { parseNotes, geminiError, geminiRetry } from "../src/lib/parseNotes";
geminiRetry.delayMs = 0;
import { pickSyncedSettings, reconcileSettings } from "../src/sync/engine";
import { modelFor, PROVIDERS } from "../src/lib/providers";
import type { Settings } from "../src/types";

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

const settings: Settings = {
  provider: "gemini",
  anthropicModel: "claude-opus-4-8",
  openaiModel: "gpt-4.1",
  geminiModel: "gemini-3.8-flash",
  geminiApiKey: "AIza-test",
};

const plan = {
  workoutName: "Shoulder session",
  sections: [
    {
      title: "Post Climbing exercise",
      notes: [],
      items: [{ name: "Shoulder shrug", category: "strength_conditioning", measureType: "reps", sets: 1, reps: 7 }],
    },
  ],
};

type Call = { url: string; init: RequestInit; body: Record<string, unknown> };
let calls: Call[] = [];
function fakeFetch(...responses: { status: number; body: unknown }[]) {
  calls = [];
  let i = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    const r = responses[Math.min(i++, responses.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
}
const ok = (text: string, extraParts: unknown[] = []) => ({
  status: 200,
  body: { candidates: [{ content: { parts: [...extraParts, { text }] }, finishReason: "STOP" }] },
});
const fails = async (p: Promise<unknown>) => {
  try {
    await p;
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};

console.log("Gemini request + response:");
{
  fakeFetch(ok(JSON.stringify(plan), [{ text: "thinking…", thought: true }]));
  const out = await parseNotes("Shoulder Shrug 1 set of 7", settings, ["Shoulder shrug"]);
  const c = calls[0];
  assert(c.url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", "calls the chosen model's generateContent endpoint");
  assert((c.init.headers as Record<string, string>)["x-goog-api-key"] === "AIza-test", "sends the key in the x-goog-api-key header (not the URL)");
  assert(!c.url.includes("AIza"), "key is not in the URL");
  assert(JSON.stringify(c.body.systemInstruction).includes("climbing coach"), "system prompt sent as systemInstruction");
  assert(JSON.stringify(c.body.contents).includes("Existing exercises") && JSON.stringify(c.body.contents).includes("Shoulder Shrug 1 set of 7"), "note + existing names sent as the user message");
  assert((c.body.generationConfig as { responseMimeType?: string })?.responseMimeType === "application/json", "asks for JSON output");
  assert(out.sections[0].items[0].reps === 7 && out.workoutName === "Shoulder session", "parses the plan");
}
{
  fakeFetch(ok("```json\n" + JSON.stringify(plan) + "\n```"));
  const out = await parseNotes("x", settings);
  assert(out.sections.length === 1, "tolerates a ```json fence around the answer");
}
{
  fakeFetch(
    { status: 400, body: { error: { code: 400, message: 'Invalid JSON payload received. Unknown name "responseMimeType"', status: "INVALID_ARGUMENT" } } },
    ok(JSON.stringify(plan)),
  );
  const out = await parseNotes("x", settings);
  assert(calls.length === 2 && !("generationConfig" in calls[1].body) && out.sections.length === 1, "falls back to prompt-only JSON if the JSON-mode field is rejected");
}
{
  fakeFetch(ok(JSON.stringify(plan)));
  await parseNotes("x", { ...settings, geminiModel: undefined });
  assert(calls[0].url.includes("/models/gemini-3.8-flash:"), "older saved settings without a Gemini model use the default");
  assert(modelFor({ ...settings, geminiModel: undefined }, PROVIDERS.gemini) === "gemini-3.8-flash", "modelFor default");
}

console.log("Busy / rate-limited models:");
const busy = { status: 503, body: { error: { code: 503, message: "The model is overloaded. Please try again later.", status: "UNAVAILABLE" } } };
const modelOf = (c: Call) => c.url.split("/models/")[1].split(":")[0];
{
  fakeFetch(busy, ok(JSON.stringify(plan)));
  const out = await parseNotes("x", settings);
  assert(calls.length === 2 && calls.every((c) => modelOf(c) === "gemini-3.8-flash") && out.sections.length === 1, "a busy model is retried once and the retry's answer used");
}
{
  fakeFetch(busy, busy, ok(JSON.stringify(plan)));
  const out = await parseNotes("x", settings);
  assert(calls.map(modelOf).join(",") === "gemini-3.8-flash,gemini-3.8-flash,gemini-3.5-flash-lite" && out.sections.length === 1, "still busy → falls back to Flash-Lite");
}
{
  fakeFetch(busy);
  const msg = await fails(parseNotes("x", settings));
  assert(calls.length === 4 && /overloaded right now \(503\) — tried 2 models/.test(msg), "everything busy → clear 'overloaded' message after 4 tries");
}
{
  fakeFetch({ status: 429, body: { error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } } }, ok(JSON.stringify(plan)));
  const out = await parseNotes("x", { ...settings, geminiModel: "gemini-3.5-flash-lite" });
  assert(calls.map(modelOf).join(",") === "gemini-3.5-flash-lite,gemini-3.8-flash" && out.sections.length === 1, "per-model limit hit → tries the other model (no same-model retry)");
}

console.log("Gemini errors:");
{
  fakeFetch({ status: 400, body: { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } } });
  assert(/key was rejected/.test(await fails(parseNotes("x", settings))), "bad key → 'key was rejected'");
  assert(calls.length === 1, "…without a pointless retry");
}
{
  fakeFetch({ status: 429, body: { error: { code: 429, message: "Resource has been exhausted", status: "RESOURCE_EXHAUSTED" } } });
  assert(/free-tier limit/.test(await fails(parseNotes("x", settings))), "429 → explains the free-tier limits");
}
{
  fakeFetch({ status: 200, body: { promptFeedback: { blockReason: "SAFETY" } } });
  assert(/declined.*SAFETY/.test(await fails(parseNotes("x", settings))), "blocked prompt explained");
}
{
  fakeFetch({ status: 200, body: { candidates: [{ content: { parts: [{ text: '{"workoutName":"x","sec' }] }, finishReason: "MAX_TOKENS" }] } });
  assert(/cut off/.test(await fails(parseNotes("x", settings))), "truncated answer explained");
}
{
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  assert(/Network error reaching Google Gemini/.test(await fails(parseNotes("x", settings))), "network failure explained");
}
assert(/model wasn't found/.test(geminiError(404, {})), "404 → model not found");
assert(/trouble right now \(503\)/.test(geminiError(503, {})), "503 → try again");
assert(/Add your Google API key/.test(await fails(parseNotes("x", { ...settings, geminiApiKey: undefined }))), "missing key → points to Settings");

console.log("Account-saved settings:");
{
  const synced = pickSyncedSettings(settings);
  assert(synced.geminiApiKey === "AIza-test" && synced.geminiModel === "gemini-3.8-flash", "Gemini key + model saved to the account with the others");
  const { apply } = reconcileSettings(
    { ...settings, syncApiKeys: true, settingsUpdatedAt: 1 },
    { enabled: true, data: { provider: "anthropic", anthropicApiKey: "sk-ant" }, updated_at: 2 },
  );
  assert(apply?.geminiApiKey === undefined, "a Gemini key removed on another device is removed here too");
}

console.log(failures === 0 ? "\nGEMINI OK ✅" : `\n${failures} FAILURES ❌`);
if (failures) process.exit(1);
