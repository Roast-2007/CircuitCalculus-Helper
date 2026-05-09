import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Alert, Linking, Platform, Text, View, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import HomeScreen from "./src/screens/HomeScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { loadAppSettings } from "./src/services/storage";
import { checkAppVersion } from "./src/services/api";
import { DEFAULT_PROXY_URL } from "./src/services/proxyDefaults";
import { APP_VERSION, APP_VERSION_CODE } from "./src/constants/appVersion";
import { TabParamList } from "./src/types";
import { theme } from "./src/theme";

const Tab = createBottomTabNavigator<TabParamList>();

function AppTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === "android" ? 8 : 20);
  const tabBarHeight = Platform.OS === "android" ? 58 + bottomInset : 54 + bottomInset;

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.mutedForeground,
          tabBarStyle: {
            backgroundColor: theme.colors.background,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingBottom: bottomInset,
            paddingTop: 6,
            height: tabBarHeight,
          },
          tabBarItemStyle: {
            paddingTop: 2,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: theme.fontWeight.medium,
          },
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarLabel: "解答",
            tabBarIcon: ({ color }: { color: string }) => (
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: "设置",
            tabBarIcon: ({ color }: { color: string }) => (
              <Ionicons name="settings-outline" size={22} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    (async () => {
      await loadAppSettings();
      setConfigReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!configReady || !DEFAULT_PROXY_URL.trim()) return;

    let cancelled = false;

    (async () => {
      try {
        const result = await checkAppVersion(DEFAULT_PROXY_URL.trim(), APP_VERSION, APP_VERSION_CODE);
        if (!cancelled && result.hasUpdate) {
          const changelog =
            result.changelog.length > 0
              ? `\n\n${result.changelog.map((item) => `• ${item}`).join("\n")}`
              : "";
          Alert.alert(
            "发现新版本",
            `最新版 ${result.latestVersion} 已可下载。${changelog}`,
            [
              { text: "稍后再说", style: "cancel" },
              {
                text: "打开浏览器",
                onPress: () => {
                  Linking.openURL(result.downloadUrl).catch(() => {});
                },
              },
            ]
          );
        }
      } catch {
        // silently fail -- auto version check is non-critical
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configReady]);

  if (!configReady) {
    return (
      <View style={styles.splash}>
        <View style={styles.splashCircle}>
          <Ionicons name="school-outline" size={34} color={theme.colors.primary} />
        </View>
        <Text style={styles.splashTitle}>数学电路助手</Text>
        <Text style={styles.splashSub}>加载中...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppTabs />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  splashCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primaryMuted,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  splashTitle: {
    fontSize: 24,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.foreground,
    marginBottom: theme.spacing.sm,
  },
  splashSub: {
    fontSize: theme.fontSize.base,
    color: theme.colors.mutedForeground,
  },
});
