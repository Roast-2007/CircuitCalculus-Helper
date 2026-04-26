import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppSettings, ProviderPreset, ProviderSelection } from "../types";
import { loadAppSettings, saveAppSettings } from "../services/storage";
import { testApiConnection } from "../services/api";
import { getEmbeddedSettings, getEmbeddedApiKey } from "../services/embeddedKeys";
import {
  VISUAL_PRESETS,
  REASONING_PRESETS,
  findVisualPreset,
  findReasoningPreset,
  defaultSelectionForPreset,
  resolveApiUrl,
  resolveModel,
} from "../constants/providerPresets";
import ProviderDropdown from "../components/ProviderDropdown";
import { theme } from "../theme";

function providerOptions(presets: ProviderPreset[]) {
  return presets.map((p) => ({ id: p.id, label: p.label }));
}

function modelOptions(preset: ProviderPreset | undefined) {
  if (!preset) return [];
  return preset.models.map((m) => ({
    id: m.id,
    label: m.label,
    tier: m.tier,
    tierHint: m.tierHint,
  }));
}

export default function SettingsScreen() {
  const [visual, setVisual] = useState<ProviderSelection | null>(null);
  const [reasoning, setReasoning] = useState<ProviderSelection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingVisual, setTestingVisual] = useState(false);
  const [testingReasoning, setTestingReasoning] = useState(false);

  useEffect(() => {
    (async () => {
      const settings = await loadAppSettings();
      setVisual(settings.visual);
      setReasoning(settings.reasoning);
      setLoaded(true);
    })();
  }, []);

  const visualPreset = visual ? findVisualPreset(visual.providerId) : undefined;
  const reasoningPreset = reasoning ? findReasoningPreset(reasoning.providerId) : undefined;

  const doSwitchVisualProvider = useCallback(
    (newProviderId: string) => {
      const preset = findVisualPreset(newProviderId);
      if (!preset) return;
      const embedded = getEmbeddedSettings();
      const embeddedKey =
        embedded?.visual.providerId === newProviderId
          ? embedded.visual.apiKey
          : getEmbeddedApiKey(newProviderId);
      setVisual({
        ...defaultSelectionForPreset(preset),
        apiKey: embeddedKey || "",
      });
    },
    []
  );

  const handleVisualProviderChange = useCallback(
    (newProviderId: string) => {
      if (!visual || newProviderId === visual.providerId) return;
      if (visual.apiKey.trim()) {
        const newPreset = findVisualPreset(newProviderId);
        Alert.alert(
          "切换供应商",
          `切换到「${newPreset?.label ?? "自定义"}」需要配置对应的 API Key，当前已填写的 Key 可能不适用。是否继续？`,
          [
            { text: "取消", style: "cancel" },
            { text: "确定切换", onPress: () => doSwitchVisualProvider(newProviderId) },
          ]
        );
      } else {
        doSwitchVisualProvider(newProviderId);
      }
    },
    [visual, doSwitchVisualProvider]
  );

  const doSwitchReasoningProvider = useCallback(
    (newProviderId: string) => {
      const preset = findReasoningPreset(newProviderId);
      if (!preset) return;
      const embedded = getEmbeddedSettings();
      const embeddedKey =
        embedded?.reasoning.providerId === newProviderId
          ? embedded.reasoning.apiKey
          : getEmbeddedApiKey(newProviderId);
      setReasoning({
        ...defaultSelectionForPreset(preset),
        apiKey: embeddedKey || "",
      });
    },
    []
  );

  const handleReasoningProviderChange = useCallback(
    (newProviderId: string) => {
      if (!reasoning || newProviderId === reasoning.providerId) return;
      if (reasoning.apiKey.trim()) {
        const newPreset = findReasoningPreset(newProviderId);
        Alert.alert(
          "切换供应商",
          `切换到「${newPreset?.label ?? "自定义"}」需要配置对应的 API Key，当前已填写的 Key 可能不适用。是否继续？`,
          [
            { text: "取消", style: "cancel" },
            { text: "确定切换", onPress: () => doSwitchReasoningProvider(newProviderId) },
          ]
        );
      } else {
        doSwitchReasoningProvider(newProviderId);
      }
    },
    [reasoning, doSwitchReasoningProvider]
  );

  const handleSave = useCallback(async () => {
    if (!visual || !reasoning) return;
    setSaving(true);
    try {
      await saveAppSettings({ visual, reasoning });
      Alert.alert("保存成功", "设置已保存");
    } catch {
      Alert.alert("保存失败", "请重试");
    } finally {
      setSaving(false);
    }
  }, [visual, reasoning]);

  const handleTestVisual = useCallback(async () => {
    if (!visual || !visualPreset) return;
    const url = resolveApiUrl(visual, visualPreset);
    const model = resolveModel(visual, visualPreset);
    if (!url) {
      Alert.alert("错误", "请填写 API 地址");
      return;
    }
    setTestingVisual(true);
    const result = await testApiConnection(url, visual.apiKey, model, visualPreset.label);
    setTestingVisual(false);
    Alert.alert(result.success ? "连接成功" : "连接失败", result.message);
  }, [visual, visualPreset]);

  const handleTestReasoning = useCallback(async () => {
    if (!reasoning || !reasoningPreset) return;
    const url = resolveApiUrl(reasoning, reasoningPreset);
    const model = resolveModel(reasoning, reasoningPreset);
    if (!url) {
      Alert.alert("错误", "请填写 API 地址");
      return;
    }
    setTestingReasoning(true);
    const result = await testApiConnection(url, reasoning.apiKey, model, reasoningPreset.label);
    setTestingReasoning(false);
    Alert.alert(result.success ? "连接成功" : "连接失败", result.message);
  }, [reasoning, reasoningPreset]);

  if (!loaded || !visual || !reasoning) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  const currentVisualModel = visualPreset?.models.find((m) => m.id === visual.modelId);
  const currentReasoningModel = reasoningPreset?.models.find((m) => m.id === reasoning.modelId);
  const isCustomVisual = visualPreset?.id === "custom_openai_visual";
  const isCustomReasoning = reasoningPreset?.id === "custom_openai_reasoning";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>设置</Text>
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 视觉识别模型 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>视觉识别模型</Text>
          <Text style={styles.sectionSubtitle}>拍照后用于识别题目和电路结构</Text>

          <ProviderDropdown
            label="供应商"
            options={providerOptions(VISUAL_PRESETS)}
            selectedId={visual.providerId}
            onSelect={handleVisualProviderChange}
          />

          {visualPreset?.modelField === "locked" ? (
            <ProviderDropdown
              label="模型"
              options={modelOptions(visualPreset)}
              selectedId={visual.modelId}
              onSelect={(modelId) =>
                setVisual((prev) => (prev ? { ...prev, modelId } : prev))
              }
            />
          ) : (
            <>
              <Text style={styles.fieldLabel}>模型名</Text>
              <TextInput
                style={styles.input}
                value={visual.customModelName}
                onChangeText={(v) =>
                  setVisual((prev) => (prev ? { ...prev, customModelName: v } : prev))
                }
                placeholder="如 gpt-4o"
                placeholderTextColor={theme.colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}

          {currentVisualModel?.tierHint && (
            <View style={styles.tierHintRow}>
              <View style={[styles.tierBadgeSmall, currentVisualModel.tier === "pro" ? styles.tierPro : styles.tierFast]}>
                <Text style={styles.tierBadgeSmallText}>
                  {currentVisualModel.tier === "pro" ? "增强" : "快速"}
                </Text>
              </View>
              <Text style={styles.tierHintText}>{currentVisualModel.tierHint}</Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>API Key</Text>
          <TextInput
            style={styles.input}
            value={visual.apiKey}
            onChangeText={(v) =>
              setVisual((prev) => (prev ? { ...prev, apiKey: v } : prev))
            }
            placeholder="输入 API Key"
            placeholderTextColor={theme.colors.mutedForeground}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          {isCustomVisual ? (
            <View style={styles.customFields}>
              <Text style={styles.fieldLabel}>API 地址</Text>
              <TextInput
                style={styles.input}
                value={visual.customApiUrl}
                onChangeText={(v) =>
                  setVisual((prev) => (prev ? { ...prev, customApiUrl: v } : prev))
                }
                placeholder="https://api.openai.com/v1"
                placeholderTextColor={theme.colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
          ) : (
            <View style={styles.readonlyField}>
              <Text style={styles.fieldLabel}>API 地址</Text>
              <View style={styles.readonlyValue}>
                <Text style={styles.readonlyValueText}>
                  {visualPreset?.apiUrl ?? ""}
                </Text>
              </View>
            </View>
          )}

          {isCustomVisual && (
            <View style={styles.warningBanner}>
              <Ionicons name="warning-outline" size={16} color={theme.colors.warningText} />
              <Text style={styles.warningText}>
                自定义视觉模型必须是多模态模型（支持图片输入），否则识别将失败
              </Text>
            </View>
          )}

          <Pressable
            onPress={handleTestVisual}
            style={({ pressed }) => [
              styles.testBtn,
              testingVisual && styles.testBtnDisabled,
              pressed && { opacity: 0.7 },
            ]}
            disabled={testingVisual}
          >
            <Text style={styles.testBtnText}>
              {testingVisual ? "测试中..." : "测试视觉连接"}
            </Text>
          </Pressable>
        </View>

        {/* 推理模型 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>推理模型</Text>
          <Text style={styles.sectionSubtitle}>识别完成后用于数学/电路分析解答</Text>

          <ProviderDropdown
            label="供应商"
            options={providerOptions(REASONING_PRESETS)}
            selectedId={reasoning.providerId}
            onSelect={handleReasoningProviderChange}
          />

          {reasoningPreset?.modelField === "locked" ? (
            <ProviderDropdown
              label="模型"
              options={modelOptions(reasoningPreset)}
              selectedId={reasoning.modelId}
              onSelect={(modelId) =>
                setReasoning((prev) => (prev ? { ...prev, modelId } : prev))
              }
            />
          ) : (
            <>
              <Text style={styles.fieldLabel}>模型名</Text>
              <TextInput
                style={styles.input}
                value={reasoning.customModelName}
                onChangeText={(v) =>
                  setReasoning((prev) => (prev ? { ...prev, customModelName: v } : prev))
                }
                placeholder="如 gpt-4o"
                placeholderTextColor={theme.colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}

          {currentReasoningModel?.tierHint && (
            <View style={styles.tierHintRow}>
              <View style={[styles.tierBadgeSmall, currentReasoningModel.tier === "pro" ? styles.tierPro : styles.tierFast]}>
                <Text style={styles.tierBadgeSmallText}>
                  {currentReasoningModel.tier === "pro" ? "增强" : "快速"}
                </Text>
              </View>
              <Text style={styles.tierHintText}>{currentReasoningModel.tierHint}</Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>API Key</Text>
          <TextInput
            style={styles.input}
            value={reasoning.apiKey}
            onChangeText={(v) =>
              setReasoning((prev) => (prev ? { ...prev, apiKey: v } : prev))
            }
            placeholder="输入 API Key"
            placeholderTextColor={theme.colors.mutedForeground}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          {isCustomReasoning ? (
            <View style={styles.customFields}>
              <Text style={styles.fieldLabel}>API 地址</Text>
              <TextInput
                style={styles.input}
                value={reasoning.customApiUrl}
                onChangeText={(v) =>
                  setReasoning((prev) => (prev ? { ...prev, customApiUrl: v } : prev))
                }
                placeholder="https://api.deepseek.com/v1"
                placeholderTextColor={theme.colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
          ) : (
            <View style={styles.readonlyField}>
              <Text style={styles.fieldLabel}>API 地址</Text>
              <View style={styles.readonlyValue}>
                <Text style={styles.readonlyValueText}>
                  {reasoningPreset?.apiUrl ?? ""}
                </Text>
              </View>
            </View>
          )}
          <Pressable
            onPress={handleTestReasoning}
            style={({ pressed }) => [
              styles.testBtn,
              testingReasoning && styles.testBtnDisabled,
              pressed && { opacity: 0.7 },
            ]}
            disabled={testingReasoning}
          >
            <Text style={styles.testBtnText}>
              {testingReasoning ? "测试中..." : "测试推理连接"}
            </Text>
          </Pressable>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>使用说明</Text>
          <Text style={styles.infoText}>
            1. 选择视觉识别模型的供应商和模型{'\n'}
            2. 填写对应的 API Key{'\n'}
            3. 选择推理模型的供应商和模型{'\n'}
            4. 填写对应的 API Key{'\n'}
            5. 拍照上传数学题或电路图开始使用{'\n'}
            6. 增强型模型适合复杂题目，快速型模型适合简单题
          </Text>
        </View>

        <View style={styles.projectSection}>
          <View style={styles.projectHeader}>
            <Ionicons name="logo-github" size={20} color={theme.colors.foreground} />
            <Text style={styles.projectTitle}>CircuitCalculus Helper</Text>
          </View>
          <Text style={styles.projectText}>作者：串烧Roast</Text>
          <Text style={styles.projectText}>项目使用 MIT License 开源</Text>
          <Text style={styles.projectLink}>github.com/Roast-2007/CircuitCalculus-Helper</Text>
        </View>

        {/* Save Button */}
        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [
            styles.saveBtn,
            saving && styles.saveBtnDisabled,
            pressed && { opacity: 0.7 },
          ]}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? "保存中..." : "保存配置"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.colors.background },
  loadingText: { fontSize: theme.fontSize.base, color: theme.colors.mutedForeground },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: Platform.OS === "android" ? 44 : 12,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.headerText,
  },
  scrollView: { flex: 1 },
  scrollContent: { padding: theme.spacing.lg, paddingBottom: 40 },
  section: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  sectionSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
    marginTop: 2,
    marginBottom: theme.spacing.sm,
  },
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mutedForeground,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  readonlyField: {
    marginTop: theme.spacing.sm,
  },
  readonlyValue: {
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    opacity: 0.6,
  },
  readonlyValueText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
  },
  customFields: {
    // container for custom-only fields
  },
  tierHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  tierBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    overflow: "hidden",
  },
  tierBadgeSmallText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: "#fff",
  },
  tierPro: { backgroundColor: "#FF9800" },
  tierFast: { backgroundColor: "#4CAF50" },
  tierHintText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: "#FFF8E1",
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  warningText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.warningText,
    lineHeight: 18,
  },
  infoSection: {
    backgroundColor: theme.colors.primaryMuted,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  infoTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
  },
  infoText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    lineHeight: 20,
    opacity: 0.7,
  },
  projectSection: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  projectHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  projectTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  projectText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    lineHeight: 20,
    opacity: 0.75,
  },
  projectLink: {
    marginTop: theme.spacing.xs,
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.medium,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.xl,
    paddingVertical: 14,
    alignItems: "center",
    ...theme.shadow.md,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    color: theme.colors.primaryForeground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  testBtn: {
    backgroundColor: theme.colors.primaryMuted,
    borderRadius: theme.radius.lg,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: theme.spacing.sm,
  },
  testBtnDisabled: { opacity: 0.5 },
  testBtnText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
});
