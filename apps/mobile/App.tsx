import React, { useCallback, useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, View } from "react-native";

import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { NotificationProvider } from "./src/context/NotificationContext";
import { initStorage, getToken, getUserId } from "./src/storage";
import { setToken, setUserId as storeUserId } from "./src/storage";

import HomeScreen from "./src/screens/HomeScreen";
import AboutScreen from "./src/screens/AboutScreen";
import TermsScreen from "./src/screens/TermsScreen";
import SyncScreen from "./src/screens/SyncScreen";

const Stack = createNativeStackNavigator();

function AppNavigator({ isAuthenticated, onSynced }: { isAuthenticated: boolean; onSynced: (t: string, u: string) => void }) {
  const { colors, isDark } = useTheme();

  if (!isAuthenticated) {
    return (
      <>
        <StatusBar style={isDark ? "light" : "dark"} />
        <SyncScreen onSynced={onSynced} />
      </>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NavigationContainer
        theme={{
          dark: isDark,
          colors: {
            primary: colors.brand,
            background: colors.bg,
            card: colors.panel,
            text: colors.text,
            border: colors.border,
            notification: colors.brand,
          },
          fonts: {
            regular: { fontFamily: "System", fontWeight: "400" },
            medium: { fontFamily: "System", fontWeight: "500" },
            bold: { fontFamily: "System", fontWeight: "700" },
            heavy: { fontFamily: "System", fontWeight: "800" },
          },
        }}
      >
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen
            name="About"
            component={AboutScreen}
            options={{
              headerShown: true,
              title: "About Zopy",
              headerStyle: { backgroundColor: colors.panel },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="Terms"
            component={TermsScreen}
            options={{
              headerShown: true,
              title: "Terms & Policies",
              headerStyle: { backgroundColor: colors.panel },
              headerTintColor: colors.text,
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    initStorage().then(async () => {
      const token = getToken();
      const userId = getUserId();
      console.log("[App] Boot — token:", !!token, "userId:", userId);

      if (token && userId) {
        setIsAuthenticated(true);
        setReady(true);
        return;
      }

      // Check if app was opened via deep link (zopy://sync-complete?syncId=xxx)
      try {
        const { default: Linking } = await import("expo-linking");
        const url = await Linking.getInitialURL();
        if (url) {
          console.log("[App] Deep link:", url);
          const parsed = Linking.parse(url);
          if (parsed.path === "sync-complete" && parsed.queryParams?.syncId) {
            const { checkMobileSyncStatus } = await import("./src/api/api");
            const res = await checkMobileSyncStatus(String(parsed.queryParams.syncId));
            if (res.status === "linked" && res.token && res.userId) {
              await setToken(res.token);
              await storeUserId(res.userId);
              setIsAuthenticated(true);
              console.log("[App] Auto-synced via deep link! userId:", res.userId);
            }
          }
        }
      } catch (err) {
        console.error("[App] Deep link error:", err);
      }

      setReady(true);
    });
  }, []);

  const handleSynced = useCallback(async (token: string, userId: string) => {
    console.log("[App] Synced! userId:", userId);
    await setToken(token);
    await storeUserId(userId);
    setIsAuthenticated(true);
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0f0f0f" }}>
        <ActivityIndicator color="#FACC15" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NotificationProvider>
          <AppNavigator isAuthenticated={isAuthenticated} onSynced={handleSynced} />
        </NotificationProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
