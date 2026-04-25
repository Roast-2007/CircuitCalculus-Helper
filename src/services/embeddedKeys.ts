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

export function getEmbeddedSettings(): AppSettings | null {
  return null; // 设为 EMBEDDED 时嵌入 Key
}
