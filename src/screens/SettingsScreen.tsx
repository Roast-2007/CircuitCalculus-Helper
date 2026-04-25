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
import { ApiKeys, DEFAULT_DEEPSEEK_MODEL, DEFAULT_SILICONFLOW_MODEL } from "../types";
import { loadKeys, saveKeys } from "../services/storage";
import { testApiConnection, Provider } from "../services/api";
import { theme } from "../theme";

export default function SettingsScreen() {
  const [keys, setKeys] = useState<ApiKeys>({
    deepseekKey: "",
    siliconflowKey: "",
    deepseekModel: DEFAULT_DEEPSEEK_MODEL,
    siliconflowModel: DEFAULT_SILICONFLOW_MODEL,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingProvider, setTestingProvider] = useState<Provider | null>(null);

  useEffect(() => {
    (async () => {
      const saved = await loadKeys();
      setKeys(saved);
      setLoaded(true);
    })();
  }, []);

  const updateField = useCallback((field: keyof ApiKeys, value: string) => {
    setKeys((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveKeys(keys);
      Alert.alert("保存成功", "API Key 和模型配置已保存");
    } catch {
      Alert.alert("保存失败", "请重试");
    } finally {
      setSaving(false);
    }
  }, [keys]);

  const handleTestConnection = useCallback(
    async (provider: Provider) => {
      setTestingProvider(provider);
      const key =
        provider === "deepseek" ? keys.deepseekKey : keys.siliconflowKey;
      const model =
        provider === "deepseek" ? keys.deepseekModel : keys.siliconflowModel;
      const result = await testApiConnection(provider, key, model);
      setTestingProvider(null);
      Alert.alert(
        result.success ? "连接成功" : "连接失败",
        result.message
      );
    },
    [keys]
  );

  if (!loaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

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
        {/* DeepSeek Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DeepSeek 配置</Text>
          <Text style={styles.fieldLabel}>API Key</Text>
          <TextInput
            style={styles.input}
            value={keys.deepseekKey}
            onChangeText={(v) => updateField("deepseekKey", v)}
            placeholder="输入 DeepSeek API Key"
            placeholderTextColor={theme.colors.mutedForeground}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.fieldLabel}>模型名</Text>
          <TextInput
            style={styles.input}
            value={keys.deepseekModel}
            onChangeText={(v) => updateField("deepseekModel", v)}
            placeholder={DEFAULT_DEEPSEEK_MODEL}
            placeholderTextColor={theme.colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            onPress={() => handleTestConnection("deepseek")}
            style={({ pressed }) => [
              styles.testBtn,
              testingProvider === "deepseek" && styles.testBtnDisabled,
              pressed && { opacity: 0.7 },
            ]}
            disabled={testingProvider === "deepseek"}
          >
            <Text style={styles.testBtnText}>
              {testingProvider === "deepseek" ? "测试中..." : "测试 DeepSeek 连接"}
            </Text>
          </Pressable>
        </View>

        {/* SiliconFlow Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>硅基流动配置</Text>
          <Text style={styles.fieldLabel}>API Key</Text>
          <TextInput
            style={styles.input}
            value={keys.siliconflowKey}
            onChangeText={(v) => updateField("siliconflowKey", v)}
            placeholder="输入硅基流动 API Key"
            placeholderTextColor={theme.colors.mutedForeground}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.fieldLabel}>模型名</Text>
          <TextInput
            style={styles.input}
            value={keys.siliconflowModel}
            onChangeText={(v) => updateField("siliconflowModel", v)}
            placeholder={DEFAULT_SILICONFLOW_MODEL}
            placeholderTextColor={theme.colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            onPress={() => handleTestConnection("siliconflow")}
            style={({ pressed }) => [
              styles.testBtn,
              testingProvider === "siliconflow" && styles.testBtnDisabled,
              pressed && { opacity: 0.7 },
            ]}
            disabled={testingProvider === "siliconflow"}
          >
            <Text style={styles.testBtnText}>
              {testingProvider === "siliconflow" ? "测试中..." : "测试硅基流动连接"}
            </Text>
          </Pressable>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>使用说明</Text>
          <Text style={styles.infoText}>
            1. 在 DeepSeek 官网 (platform.deepseek.com) 获取 API Key{'\n'}
            2. 在硅基流动官网 (siliconflow.cn) 获取 API Key{'\n'}
            3. 拍照上传数学题或电路图{'\n'}
            4. Kimi K2.6 识别内容 → DeepSeek V4 Pro 解答
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
    marginBottom: theme.spacing.md,
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
