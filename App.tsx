import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { Platform, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import HomeScreen from "./src/screens/HomeScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { loadAppSettings } from "./src/services/storage";
import { TabParamList } from "./src/types";
import { theme } from "./src/theme";

const Tab = createBottomTabNavigator<TabParamList>();

export default function App() {
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    (async () => {
      await loadAppSettings();
      setConfigReady(true);
    })();
  }, []);

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
    <>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: theme.colors.mutedForeground,
            tabBarStyle: {
              backgroundColor: theme.colors.background,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              paddingBottom: Platform.OS === "android" ? 8 : 20,
              paddingTop: 4,
              height: Platform.OS === "android" ? 56 : 80,
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
    </>
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
