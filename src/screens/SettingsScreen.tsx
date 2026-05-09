import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppSettings, AppAnnouncement, ProviderPreset, ProviderSelection, ProxyAuthState } from "../types";
import {
  loadAppSettings,
  loadProviderKeys,
  saveAppSettings,
  getProxyAuthState,
  saveProxyAuthState,
  clearProxyAuthState,
  getDismissedAnnouncementVersion,
  saveDismissedAnnouncementVersion,
} from "../services/storage";
import { checkAppVersion, fetchAnnouncement, loginViaProxy, testApiConnection } from "../services/api";
import { APP_VERSION, APP_VERSION_CODE } from "../constants/appVersion";
import { getEmbeddedSettings, getEmbeddedApiKey } from "../services/embeddedKeys";
import { DEFAULT_PROXY_URL } from "../services/proxyDefaults";
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
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === "android" ? 8 : 20);
  const [visual, setVisual] = useState<ProviderSelection | null>(null);
  const [reasoning, setReasoning] = useState<ProviderSelection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingVisual, setTestingVisual] = useState(false);
  const [testingReasoning, setTestingReasoning] = useState(false);

  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyUrl, setProxyUrl] = useState(DEFAULT_PROXY_URL);
  const [proxyJwt, setProxyJwt] = useState("");
  const [proxyStudentName, setProxyStudentName] = useState("");
  const [proxyStudentId, setProxyStudentId] = useState("");
  const [proxyName, setProxyName] = useState("");
  const [proxySid, setProxySid] = useState("");
  const [proxyCode, setProxyCode] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [announcement, setAnnouncement] = useState<AppAnnouncement | null>(null);
  const [announcementLoading, setAnnouncementLoading] = useState(false);

  const providerKeysRef = useRef<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [settings, providerKeys, proxyAuth] = await Promise.all([
        loadAppSettings(),
        loadProviderKeys(),
        getProxyAuthState(),
      ]);
      providerKeysRef.current = providerKeys;
      setVisual(settings.visual);
      setReasoning(settings.reasoning);
      if (proxyAuth) {
        setProxyEnabled(proxyAuth.enabled);
        setProxyUrl(proxyAuth.url);
        setProxyJwt(proxyAuth.jwt);
        setProxyStudentName(proxyAuth.studentName);
        setProxyStudentId(proxyAuth.studentId);
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded || !proxyUrl.trim()) return;

    let cancelled = false;

    (async () => {
      try {
        setAnnouncementLoading(true);
        const result = await fetchAnnouncement(proxyUrl.trim());
        if (!cancelled && result.hasAnnouncement) {
          const dismissedVersion = await getDismissedAnnouncementVersion();
          if (dismissedVersion < APP_VERSION_CODE) {
            setAnnouncement(result);
          }
        }
      } catch {
        // silently fail -- announcement is non-critical
      } finally {
        if (!cancelled) setAnnouncementLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loaded, proxyUrl]);

  const handleDismissAnnouncement = useCallback(async () => {
    setAnnouncement(null);
    await saveDismissedAnnouncementVersion(APP_VERSION_CODE);
  }, []);

  const visualPreset = visual ? findVisualPreset(visual.providerId) : undefined;
  const reasoningPreset = reasoning ? findReasoningPreset(reasoning.providerId) : undefined;

  const doSwitchVisualProvider = useCallback(
    (newProviderId: string) => {
      const preset = findVisualPreset(newProviderId);
      if (!preset) return;
      const savedKey = providerKeysRef.current[newProviderId] || "";
      const embedded = getEmbeddedSettings();
      const embeddedKey =
        embedded?.visual.providerId === newProviderId
          ? embedded.visual.apiKey
          : getEmbeddedApiKey(newProviderId);
      setVisual({
        ...defaultSelectionForPreset(preset),
        apiKey: savedKey || embeddedKey || "",
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
      const savedKey = providerKeysRef.current[newProviderId] || "";
      const embedded = getEmbeddedSettings();
      const embeddedKey =
        embedded?.reasoning.providerId === newProviderId
          ? embedded.reasoning.apiKey
          : getEmbeddedApiKey(newProviderId);
      setReasoning({
        ...defaultSelectionForPreset(preset),
        apiKey: savedKey || embeddedKey || "",
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

  const handleProxyLogin = useCallback(async () => {
    if (!proxyUrl.trim() || !proxyName.trim() || !proxySid.trim() || !proxyCode.trim()) {
      Alert.alert("提示", "请填写代理地址、姓名、学号和验证码");
      return;
    }
    setLoginLoading(true);
    try {
      const result = await loginViaProxy(proxyUrl.trim(), proxyName.trim(), proxySid.trim(), proxyCode.trim());
      setProxyJwt(result.jwt);
      setProxyStudentName(result.student.name);
      setProxyStudentId(result.student.studentId);
      setProxyName("");
      setProxySid("");
      setProxyCode("");
      await saveProxyAuthState({
        enabled: true,
        url: proxyUrl.trim(),
        jwt: result.jwt,
        studentName: result.student.name,
        studentId: result.student.studentId,
      });
      Alert.alert("登录成功", `${result.student.name} (${result.student.studentId})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "登录失败";
      Alert.alert("登录失败", msg);
    } finally {
      setLoginLoading(false);
    }
  }, [proxyUrl, proxyName, proxySid, proxyCode]);

  const handleProxyLogout = useCallback(async () => {
    setProxyJwt("");
    setProxyStudentName("");
    setProxyStudentId("");
    await clearProxyAuthState();
    Alert.alert("已退出", "代理登录已注销");
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    const url = proxyUrl.trim();
    if (!url) {
      Alert.alert("提示", "请先填写代理服务器地址");
      return;
    }

    setCheckingUpdate(true);
    try {
      const result = await checkAppVersion(url, APP_VERSION, APP_VERSION_CODE);
      if (!result.hasUpdate) {
        Alert.alert("已是最新版", `当前版本 ${APP_VERSION} 已是最新版`);
        return;
      }

      const changelog = result.changelog.length > 0 ? `\n\n${result.changelog.map((item) => `• ${item}`).join("\n")}` : "";
      Alert.alert(
        "发现新版本",
        `最新版 ${result.latestVersion} 已可下载。${changelog}`,
        [
          { text: "稍后再说", style: "cancel" },
          {
            text: "打开浏览器",
            onPress: () => {
              Linking.openURL(result.downloadUrl).catch(() => {
                Alert.alert("打开失败", "请稍后重试");
              });
            },
          },
        ]
      );
    } catch (err: unknown) {
      Alert.alert("检查失败", err instanceof Error ? err.message : "请稍后重试");
    } finally {
      setCheckingUpdate(false);
    }
  }, [proxyUrl]);

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
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>设置</Text>
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 40 }]}
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

        {/* Proxy Login */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>代理登录</Text>
          <Text style={styles.sectionSubtitle}>通过学校服务器使用远程 API Key，无需自行配置</Text>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>启用代理</Text>
            <Pressable
              onPress={() => setProxyEnabled((prev) => !prev)}
              style={[styles.toggleTrack, proxyEnabled && styles.toggleTrackOn]}
            >
              <View style={[styles.toggleThumb, proxyEnabled && styles.toggleThumbOn]} />
            </Pressable>
          </View>

          {proxyEnabled && (
            <>
              <Text style={styles.fieldLabel}>代理服务器地址</Text>
              <TextInput
                style={styles.input}
                value={proxyUrl}
                onChangeText={setProxyUrl}
                placeholder="http://154.21.200.102:3000"
                placeholderTextColor={theme.colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />

              {proxyJwt ? (
                <View style={styles.loggedInBox}>
                  <View style={styles.loggedInRow}>
                    <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                    <Text style={styles.loggedInText}>
                      已登录: {proxyStudentName}（{proxyStudentId}）
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleProxyLogout}
                    style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.logoutBtnText}>退出登录</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={styles.fieldLabel}>姓名</Text>
                  <TextInput
                    style={styles.input}
                    value={proxyName}
                    onChangeText={setProxyName}
                    placeholder="输入姓名"
                    placeholderTextColor={theme.colors.mutedForeground}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={styles.fieldLabel}>学号</Text>
                  <TextInput
                    style={styles.input}
                    value={proxySid}
                    onChangeText={setProxySid}
                    placeholder="输入学号"
                    placeholderTextColor={theme.colors.mutedForeground}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.fieldLabel}>验证码（身份证后四位）</Text>
                  <TextInput
                    style={styles.input}
                    value={proxyCode}
                    onChangeText={setProxyCode}
                    placeholder="输入验证码"
                    placeholderTextColor={theme.colors.mutedForeground}
                    secureTextEntry
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                  <Pressable
                    onPress={handleProxyLogin}
                    style={({ pressed }) => [
                      styles.loginBtn,
                      loginLoading && styles.loginBtnDisabled,
                      pressed && { opacity: 0.7 },
                    ]}
                    disabled={loginLoading}
                  >
                    <Text style={styles.loginBtnText}>
                      {loginLoading ? "登录中..." : "登录"}
                    </Text>
                  </Pressable>
                </>
              )}
            </>
          )}
        </View>

        {/* Announcement Banner */}
        {announcement && (
          <View style={styles.announcementSection}>
            <View style={styles.announcementHeader}>
              <Ionicons name="megaphone-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.announcementTitle}>{announcement.title}</Text>
              <Pressable onPress={handleDismissAnnouncement} style={styles.announcementDismiss}>
                <Ionicons name="close" size={18} color={theme.colors.mutedForeground} />
              </Pressable>
            </View>
            {announcement.body.map((line, index) => (
              <Text key={index} style={styles.announcementBody}>{line}</Text>
            ))}
          </View>
        )}

        {/* Update Check */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>版本更新</Text>
          <Text style={styles.sectionSubtitle}>从当前代理服务器查询最新版，发现更新后用系统浏览器打开下载页</Text>
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>当前版本</Text>
            <Text style={styles.versionValue}>{APP_VERSION}</Text>
          </View>
          <Pressable
            onPress={handleCheckUpdate}
            style={({ pressed }) => [
              styles.updateBtn,
              checkingUpdate && styles.updateBtnDisabled,
              pressed && { opacity: 0.7 },
            ]}
            disabled={checkingUpdate}
          >
            <Ionicons name="cloud-download-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.updateBtnText}>{checkingUpdate ? "检查中..." : "检查版本更新"}</Text>
          </Pressable>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>使用说明</Text>
          <Text style={styles.infoText}>
            1. 推荐使用代理登录：输入学号和身份证后四位，无需自行配置 API Key{'\n'}
            2. 或手动配置：选择视觉识别模型供应商和模型，填写 API Key{'\n'}
            3. 选择推理模型供应商和模型，填写 API Key{'\n'}
            4. 拍照上传数学题或电路图开始使用{'\n'}
            5. 增强型模型适合复杂题目，快速型模型适合简单题
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
  scrollContent: { padding: theme.spacing.lg },
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
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    marginTop: theme.spacing.sm,
  },
  versionLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
  },
  versionValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  updateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.primaryMuted,
    borderRadius: theme.radius.lg,
    paddingVertical: 10,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}33`,
  },
  updateBtnDisabled: { opacity: 0.5 },
  updateBtnText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  switchLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.border,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleTrackOn: {
    backgroundColor: theme.colors.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    marginLeft: 0,
  },
  toggleThumbOn: {
    marginLeft: 20,
  },
  loggedInBox: {
    backgroundColor: "#E8F5E9",
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  loggedInRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  loggedInText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: "#2E7D32",
  },
  logoutBtn: {
    marginTop: theme.spacing.sm,
    backgroundColor: "#FFEBEE",
    borderRadius: theme.radius.lg,
    paddingVertical: 8,
    alignItems: "center",
  },
  logoutBtnText: {
    color: "#C62828",
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  loginBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: theme.spacing.sm,
  },
  loginBtnDisabled: { opacity: 0.5 },
  loginBtnText: {
    color: theme.colors.primaryForeground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  announcementSection: {
    backgroundColor: "#FFF8E1",
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  announcementHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  announcementTitle: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.primary,
  },
  announcementDismiss: {
    padding: theme.spacing.xs,
  },
  announcementBody: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    lineHeight: 20,
    marginTop: theme.spacing.xs,
  },
});
