import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { AppSettings, ProviderSelection, ProxyAuthState } from "../types";
import { defaultSelectionForPreset, findVisualPreset, findReasoningPreset } from "../constants/providerPresets";
import { getEmbeddedSettings, getEmbeddedApiKey } from "./embeddedKeys";

const VISUAL_KEY = "app_settings_visual";
const REASONING_KEY = "app_settings_reasoning";
const PROVIDER_KEYS_KEY = "provider_api_keys";
const PROXY_URL_KEY = "proxy_url";
const PROXY_JWT_KEY = "proxy_jwt";
const PROXY_STUDENT_KEY = "proxy_student_info";
const DISMISSED_ANNOUNCEMENT_VERSION_KEY = "dismissed_announcement_version";

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

  // 没有旧键数据则直接返回默认配置（全新安装）
  const hasOldKeys = !!(deepseekKey || siliconflowKey || deepseekModel || siliconflowModel);
  if (!hasOldKeys) return defaults;

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

// ---- Proxy auth state ----

export async function getProxyAuthState(): Promise<ProxyAuthState | null> {
  const [url, jwtStr, studentJson] = await Promise.all([
    getItem(PROXY_URL_KEY),
    getItem(PROXY_JWT_KEY),
    getItem(PROXY_STUDENT_KEY),
  ]);
  if (!url || !jwtStr || !studentJson) return null;

  try {
    const student = JSON.parse(studentJson);
    return { enabled: true, url, jwt: jwtStr, studentName: student.name, studentId: student.studentId };
  } catch {
    return null;
  }
}

export async function saveProxyAuthState(state: ProxyAuthState): Promise<void> {
  await Promise.all([
    setItem(PROXY_URL_KEY, state.url),
    setItem(PROXY_JWT_KEY, state.jwt),
    setItem(PROXY_STUDENT_KEY, JSON.stringify({ name: state.studentName, studentId: state.studentId })),
  ]);
}

export async function clearProxyAuthState(): Promise<void> {
  await Promise.all([
    deleteItem(PROXY_URL_KEY),
    deleteItem(PROXY_JWT_KEY),
    deleteItem(PROXY_STUDENT_KEY),
  ]);
}

export async function getDismissedAnnouncementVersion(): Promise<number> {
  const raw = await getItem(DISMISSED_ANNOUNCEMENT_VERSION_KEY);
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function saveDismissedAnnouncementVersion(version: number): Promise<void> {
  await setItem(DISMISSED_ANNOUNCEMENT_VERSION_KEY, String(version));
}
