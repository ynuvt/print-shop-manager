import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

type Option<T extends string> = { label: string; value: T };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
};

export default function ToggleGroup<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.panelMuted }]}>
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            activeOpacity={0.7}
            onPress={() => onChange(opt.value)}
            style={[
              styles.item,
              {
                backgroundColor: isActive
                  ? isDark
                    ? `${colors.brand}20`
                    : `${colors.panel}F0`
                  : `${colors.panel}90`,
                borderColor: isActive
                  ? `${colors.brand}66`
                  : "transparent",
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: isActive
                    ? isDark
                      ? colors.brand
                      : colors.text
                    : colors.textMuted,
                },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 12,
    padding: 5,
    gap: 6,
  },
  item: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    textAlign: "center",
  },
});
