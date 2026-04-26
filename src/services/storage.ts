import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { AppSettings, ProviderSelection } from "../types";
import { defaultSelectionForPreset, findVisualPreset, findReasoningPreset } from "../constants/providerPresets";
import { getEmbeddedSettings, getEmbeddedApiKey } from "./embeddedKeys";

const VISUAL_KEY = "app_settings_visual";
const REASONING_KEY = "app_settings_reasoning";

// 旧键（迁移用）
const OLD_KEYS = {
  DEEPSEEK_KEY: "deepseek_api_key",
  SILICONFLOW_KEY: "siliconflow_api_key",
  DEEPSEEK_MODEL: "deepseek_model",
  SILICONFLOW_MODEL: "siliconflow_model",
};

const isSecure = Platform.OS !== "web";

async function setItem(key: string, value: string): Promise<void> {
  if (isSecure) {
    await SecureStore.setItemAsync(key, value);
  }
}

async function getItem(key: string): Promise<string | null> {
  if (isSecure) {
    return SecureStore.getItemAsync(key);
  }
  return null;
}

async function deleteItem(key: string): Promise<void> {
  if (isSecure) {
    await SecureStore.deleteItemAsync(key);
  }
}

function createDefaultSettings(): AppSettings {
  const visualPreset = findVisualPreset("siliconflow")!;
  const reasoningPreset = findReasoningPreset("deepseek")!;
  return {
    visual: defaultSelectionForPreset(visualPreset),
    reasoning: defaultSelectionForPreset(reasoningPreset),
  };
}

function mergeEmbeddedSettings(settings: AppSettings): AppSettings {
  const embedded = getEmbeddedSettings();
  if (!embedded) return settings;

  return {
    visual: {
      ...settings.visual,
      apiKey: settings.visual.apiKey || embedded.visual.apiKey || getEmbeddedApiKey(settings.visual.providerId) || "",
    },
    reasoning: {
      ...settings.reasoning,
      apiKey: settings.reasoning.apiKey || embedded.reasoning.apiKey || getEmbeddedApiKey(settings.reasoning.providerId) || "",
    },
  };
}

async function migrateFromOldKeys(): Promise<AppSettings> {
  const [deepseekKey, siliconflowKey, deepseekModel, siliconflowModel] =
    await Promise.all([
      getItem(OLD_KEYS.DEEPSEEK_KEY),
      getItem(OLD_KEYS.SILICONFLOW_KEY),
      getItem(OLD_KEYS.DEEPSEEK_MODEL),
      getItem(OLD_KEYS.SILICONFLOW_MODEL),
    ]);

  const defaults = createDefaultSettings();

  const settings: AppSettings = {
    visual: {
      ...defaults.visual,
      providerId: "siliconflow",
      modelId: siliconflowModel || defaults.visual.modelId,
      apiKey: siliconflowKey ?? "",
    },
    reasoning: {
      ...defaults.reasoning,
      providerId: "deepseek",
      modelId: deepseekModel || defaults.reasoning.modelId,
      apiKey: deepseekKey ?? "",
    },
  };

  await saveAppSettings(settings);

  // 清理旧键
  await Promise.all(
    Object.values(OLD_KEYS).map((key) => deleteItem(key))
  );

  return mergeEmbeddedSettings(settings);
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await Promise.all([
    setItem(VISUAL_KEY, JSON.stringify(settings.visual)),
    setItem(REASONING_KEY, JSON.stringify(settings.reasoning)),
  ]);
}

export async function loadAppSettings(): Promise<AppSettings> {
  const [visualJson, reasoningJson] = await Promise.all([
    getItem(VISUAL_KEY),
    getItem(REASONING_KEY),
  ]);

  if (visualJson && reasoningJson) {
    try {
      return mergeEmbeddedSettings({
        visual: JSON.parse(visualJson),
        reasoning: JSON.parse(reasoningJson),
      });
    } catch {
      // fall through to migration
    }
  }

  return migrateFromOldKeys();
}
