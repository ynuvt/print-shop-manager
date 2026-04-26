import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "./ThemeContext";

type Variant = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  variant: Variant;
};

type NotificationContextValue = {
  notify: (message: string, options?: { variant?: Variant }) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const { colors, isDark } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 250, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, 4000);

    return () => clearTimeout(timer);
  }, [opacity, translateY, onDismiss]);

  const accent =
    item.variant === "success"
      ? colors.success
      : item.variant === "error"
        ? colors.error
        : colors.brand;

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity,
          transform: [{ translateY }],
          backgroundColor: colors.panel,
          borderColor: colors.border,
          shadowColor: isDark ? "#000" : "#0f172a",
        },
      ]}
    >
      <View style={[styles.toastAccent, { backgroundColor: accent }]} />
      <Text style={[styles.toastText, { color: colors.text }]} numberOfLines={3}>
        {item.message}
      </Text>
      <TouchableOpacity onPress={onDismiss} hitSlop={8}>
        <Text style={{ color: colors.textMuted, fontSize: 18, fontWeight: "600" }}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const notify = useCallback(
    (message: string, options: { variant?: Variant } = {}) => {
      const id = `n_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      setItems((prev) => [{ id, message, variant: options.variant ?? "info" }, ...prev]);
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <View style={styles.stack} pointerEvents="box-none">
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </View>
    </NotificationContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotify must be used within NotificationProvider");
  return ctx;
}

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    top: 60,
    left: 12,
    right: 12,
    zIndex: 999,
    gap: 8,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  toastAccent: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  toastText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
});
