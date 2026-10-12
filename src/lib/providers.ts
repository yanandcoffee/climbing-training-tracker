import type { AIProvider, Settings } from "../types";

type KeyField = "anthropicApiKey" | "openaiApiKey" | "geminiApiKey";
type ModelField = "anthropicModel" | "openaiModel" | "geminiModel";

export interface ProviderInfo {
  id: AIProvider;
  /** Short name for buttons ("Read with …"). */
  name: string;
  /** Longer label for the Settings toggle. */
  label: string;
  company: string;
  keyField: KeyField;
  modelField: ModelField;
  keyPlaceholder: string;
  models: { id: string; label: string }[];
  /** Extra guidance shown under the key field. */
  help?: string;
}

export const PROVIDERS: Record<AIProvider, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    name: "Claude",
    label: "Claude (Anthropic)",
    company: "Anthropic",
    keyField: "anthropicApiKey",
    modelField: "anthropicModel",
    keyPlaceholder: "sk-ant-…",
    models: [
      { id: "claude-opus-4-8", label: "Opus 4.8 (most capable)" },
      { id: "claude-sonnet-5", label: "Sonnet 5 (balanced)" },
      { id: "claude-haiku-4-5", label: "Haiku 4.5 (fast / cheap)" },
    ],
  },
  openai: {
    id: "openai",
    name: "ChatGPT",
    label: "ChatGPT (OpenAI)",
    company: "OpenAI",
    keyField: "openaiApiKey",
    modelField: "openaiModel",
    keyPlaceholder: "sk-…",
    models: [
      { id: "gpt-4.1", label: "GPT-4.1 (capable)" },
      { id: "gpt-5", label: "GPT-5 (most capable)" },
      { id: "gpt-4o-mini", label: "GPT-4o mini (fast / cheap)" },
    ],
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    label: "Gemini (Google)",
    company: "Google",
    keyField: "geminiApiKey",
    modelField: "geminiModel",
    keyPlaceholder: "AIza…",
    models: [
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (free tier)" },
      { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (free tier, fastest)" },
    ],
    help: "Free key, no card needed: aistudio.google.com → Get API key. On the free tier Google may use what you send to improve its products, and there are per-minute and per-day request limits.",
  },
};

export const PROVIDER_ORDER: AIProvider[] = ["anthropic", "openai", "gemini"];

export function providerOf(settings: Settings): ProviderInfo {
  return PROVIDERS[settings.provider] ?? PROVIDERS.anthropic;
}

export function apiKeyFor(settings: Settings, p: ProviderInfo = providerOf(settings)): string | undefined {
  return settings[p.keyField];
}

export function modelFor(settings: Settings, p: ProviderInfo = providerOf(settings)): string {
  return settings[p.modelField] || p.models[0].id;
}
