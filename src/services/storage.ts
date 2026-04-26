import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { AppSettings, ProviderSelection } from "../types";
import { defaultSelectionForPreset, findVisualPreset, findReasoningPreset } from "../constants/providerPresets";
import { getEmbeddedSettings, getEmbeddedApiKey } from "./embeddedKeys";

const VISUAL_KEY = "app_settings_visual";
const REASONING_KEY = "app_settings_reasoning";
const PROVIDER_KEYS_KEY = "provider_api_keys";

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
  const visualPreset = findVisualPreset("alibaba_bailian")!;
  const reasoningPreset = findReasoningPreset("deepseek")!;
  return {
    visual: defaultSelectionForPreset(visualPreset),
    reasoning: defaultSelectionForPreset(reasoningPreset),
  };
}

export async function loadProviderKeys(): Promise<Record<string, string>> {
  try {
    const raw = await getItem(PROVIDER_KEYS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveProviderKeys(keys: Record<string, string>): Promise<void> {
  await setItem(PROVIDER_KEYS_KEY, JSON.stringify(keys));
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

function fillProviderKeys(settings: AppSettings, providerKeys: Record<string, string>): AppSettings {
  return {
    visual: {
      ...settings.visual,
      apiKey: settings.visual.apiKey || providerKeys[settings.visual.providerId] || "",
    },
    reasoning: {
      ...settings.reasoning,
      apiKey: settings.reasoning.apiKey || providerKeys[settings.reasoning.providerId] || "",
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
  const providerKeys = await loadProviderKeys();
  if (settings.visual.apiKey.trim()) {
    providerKeys[settings.visual.providerId] = settings.visual.apiKey;
  }
  if (settings.reasoning.apiKey.trim()) {
    providerKeys[settings.reasoning.providerId] = settings.reasoning.apiKey;
  }

  await Promise.all([
    setItem(VISUAL_KEY, JSON.stringify(settings.visual)),
    setItem(REASONING_KEY, JSON.stringify(settings.reasoning)),
    saveProviderKeys(providerKeys),
  ]);
}

export async function loadAppSettings(): Promise<AppSettings> {
  const [visualJson, reasoningJson, providerKeys] = await Promise.all([
    getItem(VISUAL_KEY),
    getItem(REASONING_KEY),
    loadProviderKeys(),
  ]);

  if (visualJson && reasoningJson) {
    try {
      const merged = mergeEmbeddedSettings({
        visual: JSON.parse(visualJson),
        reasoning: JSON.parse(reasoningJson),
      });
      return fillProviderKeys(merged, providerKeys);
    } catch {
      // fall through to migration
    }
  }

  return migrateFromOldKeys();
}
