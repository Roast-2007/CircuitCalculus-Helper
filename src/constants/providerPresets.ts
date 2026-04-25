import { ProviderPreset, ProviderSelection } from "../types";

export const VISUAL_PRESETS: ProviderPreset[] = [
  {
    id: "siliconflow",
    label: "硅基流动",
    apiUrl: "https://api.siliconflow.cn/v1",
    apiKeyField: "required",
    modelField: "locked",
    models: [
      { id: "Pro/moonshotai/Kimi-K2.6", label: "Kimi-K2.6", tier: "pro", tierHint: "适合复杂题" },
      { id: "Pro/moonshotai/Kimi-K2.5", label: "Kimi-K2.5", tier: "pro", tierHint: "适合复杂题" },
    ],
  },
  {
    id: "alibaba_bailian",
    label: "阿里云百炼",
    apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyField: "required",
    modelField: "locked",
    models: [
      { id: "qwen3.6-plus", label: "qwen3.6-plus", tier: "pro", tierHint: "适合复杂题" },
      { id: "qwen3.6-flash", label: "qwen3.6-flash", tier: "fast", tierHint: "适合简单题" },
      { id: "qwen3.5-plus", label: "qwen3.5-plus", tier: "pro", tierHint: "适合复杂题" },
      { id: "qwen3.5-flash", label: "qwen3.5-flash", tier: "fast", tierHint: "适合简单题" },
    ],
  },
  {
    id: "custom_openai_visual",
    label: "自定义 OpenAI 兼容",
    apiUrl: null,
    apiKeyField: "unlocked",
    modelField: "unlocked",
    models: [],
  },
];

export const REASONING_PRESETS: ProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    apiUrl: "https://api.deepseek.com/v1",
    apiKeyField: "required",
    modelField: "locked",
    models: [
      { id: "deepseek-v4-pro", label: "deepseek-v4-pro", tier: "pro", tierHint: "适合复杂题" },
      { id: "deepseek-v4-flash", label: "deepseek-v4-flash", tier: "fast", tierHint: "适合简单题" },
    ],
  },
  {
    id: "custom_openai_reasoning",
    label: "自定义 OpenAI 兼容",
    apiUrl: null,
    apiKeyField: "unlocked",
    modelField: "unlocked",
    models: [],
  },
];

export function findVisualPreset(id: string): ProviderPreset | undefined {
  return VISUAL_PRESETS.find((p) => p.id === id);
}

export function findReasoningPreset(id: string): ProviderPreset | undefined {
  return REASONING_PRESETS.find((p) => p.id === id);
}

export function defaultSelectionForPreset(preset: ProviderPreset): ProviderSelection {
  return {
    providerId: preset.id,
    modelId: preset.models[0]?.id ?? "",
    apiKey: "",
    customApiUrl: "",
    customModelName: "",
  };
}

export function resolveApiUrl(selection: ProviderSelection, preset: ProviderPreset | undefined): string {
  return preset?.apiUrl ?? selection.customApiUrl;
}

export function resolveModel(selection: ProviderSelection, preset: ProviderPreset | undefined): string {
  if (!preset) return selection.customModelName;
  return preset.modelField === "locked" ? selection.modelId : selection.customModelName;
}
