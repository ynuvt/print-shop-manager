import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Upload } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";

type Props = {
  isUploading: boolean;
  uploadStage: "uploading" | "converting" | "creating";
  onPickFiles: () => void;
};

export default function UploadArea({ isUploading, uploadStage, onPickFiles }: Props) {
  const { colors, isDark } = useTheme();

  const statusText = isUploading
    ? uploadStage === "converting"
      ? "Converting documents..."
      : uploadStage === "creating"
        ? "Processing files..."
        : "Uploading files..."
    : "PDF, Word, PowerPoint, or Images.";

  return (
    <View style={[styles.dropzone, { borderColor: colors.border, backgroundColor: colors.panelMuted }]}>
      <TouchableOpacity
        style={[
          styles.circle,
          {
            backgroundColor: isDark ? "#2a2a2a" : "#fff",
            borderColor: isDark ? `${colors.brand}50` : `${colors.border}B0`,
            shadowColor: isDark ? colors.brand : "#1a7af8",
          },
        ]}
        activeOpacity={0.8}
        onPress={onPickFiles}
        disabled={isUploading}
      >
        <Upload size={30} strokeWidth={2.2} color={isDark ? colors.brand : "#13161b"} />
        <Text style={[styles.circleLabel, { color: isDark ? colors.brand : "#13161b" }]}>
          Upload Files
        </Text>
      </TouchableOpacity>
      <Text style={[styles.hint, { color: colors.textMuted }]}>{statusText}</Text>
      {isUploading && <ActivityIndicator color={colors.brand} style={{ marginTop: 6 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  dropzone: {
    marginTop: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 10,
  },
  circle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
  },
  circleLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  hint: {
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
});
