import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

type Props = {
  verificationCode: string;
  onCreateMore: () => void;
};

export default function SuccessCard({ verificationCode, onCreateMore }: Props) {
  const { colors } = useTheme();
  const digits = verificationCode.split("");

  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.card, { borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Job submitted successfully</Text>
        <View style={styles.otpRow}>
          {digits.map((d, i) => (
            <View
              key={`${d}-${i}`}
              style={[styles.digit, { backgroundColor: `${colors.brand}18`, borderColor: `${colors.brand}40` }]}
            >
              <Text style={[styles.digitText, { color: colors.brand }]}>{d}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Show this to the shopkeeper and collect your prints.
        </Text>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.brand }]}
          activeOpacity={0.8}
          onPress={onCreateMore}
        >
          <Text style={styles.btnText}>Create More Jobs</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.feedback, { borderColor: colors.border }]}>
        <Text style={[styles.feedbackTitle, { color: colors.text }]}>We are in beta</Text>
        <Text style={[styles.feedbackNote, { color: colors.textMuted }]}>
          We are also from TCET and would love to hear your feedback.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 10,
  },
  label: { fontSize: 13, fontWeight: "600" },
  otpRow: { flexDirection: "row", gap: 8, marginVertical: 6 },
  digit: {
    width: 44,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  digitText: { fontSize: 24, fontWeight: "800" },
  hint: { fontSize: 12, textAlign: "center" },
  btn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 6,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  feedback: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  feedbackTitle: { fontSize: 14, fontWeight: "700" },
  feedbackNote: { fontSize: 12 },
});
