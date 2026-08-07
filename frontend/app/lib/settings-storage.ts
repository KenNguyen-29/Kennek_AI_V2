export type AppLanguage = "vi" | "en";

export type ApiKeysSettings = {
  groq: string;
  openai: string;
  gemini: string;
};

export type ModelPreferences = {
  coreBrain: string;
  reasoning: string;
  vision: string;
  speech: string;
  temperature: number;
};

export type SystemPreferences = {
  language: AppLanguage;
  introEnabled: boolean;
  autoDeleteChatsAfter30Days: boolean;
};

export type KennekSettings = {
  apiKeys: ApiKeysSettings;
  models: ModelPreferences;
  system: SystemPreferences;
};

export const SETTINGS_STORAGE_KEY = "kennek-settings-v1";

export const DEFAULT_SETTINGS: KennekSettings = {
  apiKeys: {
    groq: "",
    openai: "",
    gemini: "",
  },
  models: {
    coreBrain: "llama-3.3-70b-versatile",
    reasoning: "deepseek-r1-distill-llama-70b",
    vision: "qwen/qwen3.6-27b",
    speech: "whisper-large-v3-turbo",
    temperature: 0.2,
  },
  system: {
    language: "vi",
    introEnabled: true,
    autoDeleteChatsAfter30Days: false,
  },
};

export const MODEL_OPTIONS = {
  coreBrain: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "openai/gpt-oss-120b",
  ],
  reasoning: [
    "deepseek-r1-distill-llama-70b",
    "qwen/qwen3-32b",
  ],
  vision: [
    "qwen/qwen3.6-27b",
    "meta-llama/llama-4-scout-17b-16e-instruct",
  ],
  speech: [
    "whisper-large-v3-turbo",
    "whisper-large-v3",
  ],
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function loadSettings(): KennekSettings {
  if (typeof window === "undefined") {
    return structuredClone(DEFAULT_SETTINGS);
  }

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return structuredClone(DEFAULT_SETTINGS);
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) {
      return structuredClone(DEFAULT_SETTINGS);
    }

    const apiKeys = isObject(parsed.apiKeys) ? parsed.apiKeys : {};
    const models = isObject(parsed.models) ? parsed.models : {};
    const system = isObject(parsed.system) ? parsed.system : {};

    return {
      apiKeys: {
        groq: typeof apiKeys.groq === "string" ? apiKeys.groq : "",
        openai: typeof apiKeys.openai === "string" ? apiKeys.openai : "",
        gemini: typeof apiKeys.gemini === "string" ? apiKeys.gemini : "",
      },
      models: {
        coreBrain:
          typeof models.coreBrain === "string"
            ? models.coreBrain
            : DEFAULT_SETTINGS.models.coreBrain,
        reasoning:
          typeof models.reasoning === "string"
            ? models.reasoning
            : DEFAULT_SETTINGS.models.reasoning,
        vision:
          typeof models.vision === "string"
            ? models.vision
            : DEFAULT_SETTINGS.models.vision,
        speech:
          typeof models.speech === "string"
            ? models.speech
            : DEFAULT_SETTINGS.models.speech,
        temperature:
          typeof models.temperature === "number"
            ? Math.min(1, Math.max(0, models.temperature))
            : DEFAULT_SETTINGS.models.temperature,
      },
      system: {
        language: system.language === "en" ? "en" : "vi",
        introEnabled:
          typeof system.introEnabled === "boolean"
            ? system.introEnabled
            : true,
        autoDeleteChatsAfter30Days:
          typeof system.autoDeleteChatsAfter30Days === "boolean"
            ? system.autoDeleteChatsAfter30Days
            : false,
      },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings: KennekSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(
    new CustomEvent("kennek-settings-changed", { detail: settings }),
  );
}

export function clearLocalCaches(): void {
  const keep = new Set([SETTINGS_STORAGE_KEY, "kennek-theme"]);
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && !keep.has(key)) {
      keys.push(key);
    }
  }
  keys.forEach((key) => localStorage.removeItem(key));

  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
}

export function maskSecret(value: string): string {
  if (!value) {
    return "";
  }
  if (value.length <= 8) {
    return "•".repeat(value.length);
  }
  return `${value.slice(0, 4)}${"•".repeat(Math.min(12, value.length - 8))}${value.slice(-4)}`;
}
