import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { ApiKeys, DEFAULT_DEEPSEEK_MODEL, DEFAULT_SILICONFLOW_MODEL } from "../types";

const KEYS = {
  DEEPSEEK_KEY: "deepseek_api_key",
  SILICONFLOW_KEY: "siliconflow_api_key",
  DEEPSEEK_MODEL: "deepseek_model",
  SILICONFLOW_MODEL: "siliconflow_model",
};

// SecureStore only works on physical devices, not Expo Go
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

export async function saveKeys(keys: ApiKeys): Promise<void> {
  await setItem(KEYS.DEEPSEEK_KEY, keys.deepseekKey);
  await setItem(KEYS.SILICONFLOW_KEY, keys.siliconflowKey);
  await setItem(KEYS.DEEPSEEK_MODEL, keys.deepseekModel);
  await setItem(KEYS.SILICONFLOW_MODEL, keys.siliconflowModel);
}

export async function loadKeys(): Promise<ApiKeys> {
  const [deepseekKey, siliconflowKey, deepseekModel, siliconflowModel] =
    await Promise.all([
      getItem(KEYS.DEEPSEEK_KEY),
      getItem(KEYS.SILICONFLOW_KEY),
      getItem(KEYS.DEEPSEEK_MODEL),
      getItem(KEYS.SILICONFLOW_MODEL),
    ]);

  return {
    deepseekKey: deepseekKey ?? "",
    siliconflowKey: siliconflowKey ?? "",
    deepseekModel: deepseekModel ?? DEFAULT_DEEPSEEK_MODEL,
    siliconflowModel: siliconflowModel ?? DEFAULT_SILICONFLOW_MODEL,
  };
}

export async function clearKeys(): Promise<void> {
  await Promise.all([
    deleteItem(KEYS.DEEPSEEK_KEY),
    deleteItem(KEYS.SILICONFLOW_KEY),
    deleteItem(KEYS.DEEPSEEK_MODEL),
    deleteItem(KEYS.SILICONFLOW_MODEL),
  ]);
}
