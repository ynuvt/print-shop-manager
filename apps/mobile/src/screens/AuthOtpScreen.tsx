import React, { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import { useNotify } from "../context/NotificationContext";
import { loginWithWhatsappOtp } from "../api/api";
import { setToken, setUserId } from "../storage";

export default function AuthOtpScreen() {
  const { colors } = useTheme();
  const { notify } = useNotify();
  const navigation = useNavigation();

  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSync = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setErrorMsg("Please enter the 6-digit code from WhatsApp.");
      return;
    }
    setStatus("loading");
    setErrorMsg("");

    try {
      const { token, userId } = await loginWithWhatsappOtp(trimmed);
      await setToken(token);
      await setUserId(userId);
      setStatus("success");
      notify("WhatsApp synced successfully! 🎉", { variant: "success" });
      setTimeout(() => navigation.goBack(), 1500);
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Sync failed. Check the code and try again."
      );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Sync WhatsApp</Text>

        <Text style={[styles.step, { color: colors.textMuted }]}>
          1. Open WhatsApp and send <Text style={{ fontWeight: "700", color: colors.text }}>"sync"</Text> to the Zopy bot
        </Text>
        <Text style={[styles.step, { color: colors.textMuted }]}>
          2. You'll receive a link with a 6-digit code
        </Text>
        <Text style={[styles.step, { color: colors.textMuted }]}>
          3. Copy the <Text style={{ fontWeight: "700", color: colors.text }}>6-digit code</Text> from the link and paste it below
        </Text>

        <Text style={[styles.hint, { color: colors.textMuted }]}>
          The code is in the link: zopy.co.in/auth/otp?code=<Text style={{ fontWeight: "700", color: colors.brand }}>123456</Text>
        </Text>

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.bg,
              borderColor: status === "error" ? colors.error : colors.border,
              color: colors.text,
            },
          ]}
          placeholder="Enter 6-digit code"
          placeholderTextColor={colors.textMuted}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />

        {errorMsg ? (
          <Text style={[styles.error, { color: colors.error }]}>{errorMsg}</Text>
        ) : null}

        {status === "success" ? (
          <View style={[styles.successBadge, { backgroundColor: "#22c55e20" }]}>
            <Text style={{ color: "#22c55e", fontWeight: "700", fontSize: 15 }}>
              ✅ Synced successfully! Redirecting...
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.btn,
              { backgroundColor: code.trim().length === 6 ? colors.brand : colors.panelMuted },
            ]}
            onPress={handleSync}
            disabled={status === "loading" || code.trim().length !== 6}
          >
            {status === "loading" ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Sync Account</Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>← Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20 },
  card: { borderWidth: 1, borderRadius: 16, padding: 24 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 20 },
  step: { fontSize: 14, marginBottom: 8, lineHeight: 20 },
  hint: { fontSize: 12, marginTop: 8, marginBottom: 16, fontStyle: "italic" },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 8,
    textAlign: "center",
    marginBottom: 12,
  },
  error: { fontSize: 13, marginBottom: 8 },
  successBadge: { borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 12 },
  btn: { borderRadius: 12, paddingVertical: 15, alignItems: "center", marginBottom: 12 },
  backBtn: { alignItems: "center", paddingVertical: 8 },
});
