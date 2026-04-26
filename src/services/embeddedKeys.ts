import { AppSettings } from "../types";

const EMBEDDED: AppSettings = {
  visual: {
    providerId: "siliconflow",
    modelId: "Pro/moonshotai/Kimi-K2.5",
    apiKey: "",
    customApiUrl: "",
    customModelName: "",
  },
  reasoning: {
    providerId: "deepseek",
    modelId: "deepseek-v4-pro",
    apiKey: "",
    customApiUrl: "",
    customModelName: "",
  },
};

const EMBEDDED_API_KEYS: Record<string, string> = {
  siliconflow: "",
  deepseek: "",
  alibaba_bailian: "",
};

export function getEmbeddedSettings(): AppSettings | null {
  return null; // 设为 EMBEDDED 时嵌入 Key
}

export function getEmbeddedApiKey(providerId: string): string | null {
  const key = EMBEDDED_API_KEYS[providerId];
  return key || null;
}
