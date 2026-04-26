import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { requestMobileSync, checkMobileSyncStatus } from "../api/api";
import { WHATSAPP_NUMBER } from "../config";

type SyncStatus = "idle" | "generating" | "waiting" | "success" | "error" | "expired";

interface Props {
  onSynced: (token: string, userId: string) => void;
}

export default function SyncScreen({ onSynced }: Props) {
  const { colors, isDark } = useTheme();
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startSync = async () => {
    setStatus("generating");
    setErrorMsg("");
    stopPolling();

    try {
      const { syncId, otp } = await requestMobileSync();
      syncIdRef.current = syncId;

      const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=ZOPY-${otp}`;
      await Linking.openURL(waUrl);

      setStatus("waiting");

      pollRef.current = setInterval(async () => {
        try {
          const res = await checkMobileSyncStatus(syncId);
          if (res.status === "linked" && res.token && res.userId) {
            stopPolling();
            setStatus("success");
            setTimeout(() => onSynced(res.token, res.userId!), 1200);
          } else if (res.status === "expired") {
            stopPolling();
            setStatus("expired");
          }
        } catch {
          // Silent — keep polling
        }
      }, 3000);

      setTimeout(() => {
        if (syncIdRef.current === syncId) {
          stopPolling();
          setStatus((s) => (s === "waiting" ? "expired" : s));
        }
      }, 5 * 60 * 1000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to generate sync code.");
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Logo */}
      <View style={styles.logoArea}>
        <Image
          source={require("../../public/zopy.png")}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={[styles.tagline, { color: colors.textMuted }]}>PRINT FROM ANYWHERE</Text>
      </View>

      {/* Card */}
      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
        {status === "idle" && (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Connect WhatsApp</Text>
            <Text style={[styles.desc, { color: colors.textMuted }]}>
              Link your WhatsApp to get started. We'll send a one-time code to verify your number.
            </Text>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
              onPress={startSync}
              activeOpacity={0.8}
            >
              <Text style={[styles.primaryBtnText, { color: isDark ? "#0f0f0f" : "#fff" }]}>
                Connect with WhatsApp
              </Text>
            </TouchableOpacity>

            <View style={styles.stepsContainer}>
              {[
                "Tap the button above",
                "Send the pre-filled code on WhatsApp",
                "Come back here — we'll detect it instantly",
              ].map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={[styles.stepBadge, { backgroundColor: colors.brand + "20" }]}>
                    <Text style={[styles.stepNum, { color: colors.brand }]}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.stepText, { color: colors.textMuted }]}>{step}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {status === "generating" && (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={[styles.waitText, { color: colors.textMuted }]}>Generating sync code...</Text>
          </View>
        )}

        {status === "waiting" && (
          <View style={styles.centerContent}>
            <View style={[styles.pulseRing, { borderColor: colors.brand }]}>
              <ActivityIndicator size="large" color={colors.brand} />
            </View>
            <Text style={[styles.title, { color: colors.text, marginTop: 20 }]}>Waiting for sync...</Text>
            <Text style={[styles.desc, { color: colors.textMuted }]}>
              Send the message on WhatsApp, then come back here. We'll auto-detect it.
            </Text>
            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: colors.border }]}
              onPress={() => { stopPolling(); setStatus("idle"); }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === "success" && (
          <View style={styles.centerContent}>
            <Text style={{ fontSize: 48 }}>✅</Text>
            <Text style={[styles.title, { color: colors.text, marginTop: 12 }]}>Synced!</Text>
            <Text style={[styles.desc, { color: colors.textMuted }]}>
              Your WhatsApp is connected. Setting up your account...
            </Text>
            <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: 8 }} />
          </View>
        )}

        {status === "expired" && (
          <View style={styles.centerContent}>
            <Text style={{ fontSize: 48 }}>⏳</Text>
            <Text style={[styles.title, { color: colors.text, marginTop: 12 }]}>Code Expired</Text>
            <Text style={[styles.desc, { color: colors.textMuted }]}>
              The sync code has expired. Please try again.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
              onPress={startSync}
              activeOpacity={0.8}
            >
              <Text style={[styles.primaryBtnText, { color: isDark ? "#0f0f0f" : "#fff" }]}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === "error" && (
          <View style={styles.centerContent}>
            <Text style={{ fontSize: 48 }}>❌</Text>
            <Text style={[styles.title, { color: colors.text, marginTop: 12 }]}>Sync Failed</Text>
            <Text style={[styles.desc, { color: colors.error }]}>{errorMsg}</Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
              onPress={startSync}
              activeOpacity={0.8}
            >
              <Text style={[styles.primaryBtnText, { color: isDark ? "#0f0f0f" : "#fff" }]}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={[styles.footerText, { color: colors.textMuted }]}>
        By continuing, you agree to our Terms of Service
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  logoArea: { alignItems: "center", marginBottom: 28 },
  logoImage: { width: 72, height: 72, borderRadius: 18, marginBottom: 10 },
  tagline: { fontSize: 11, fontWeight: "700", letterSpacing: 3 },
  card: { borderWidth: 1, borderRadius: 20, padding: 24 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  desc: { fontSize: 14, lineHeight: 21, marginBottom: 16 },
  centerContent: { alignItems: "center", paddingVertical: 12 },
  waitText: { fontSize: 14, marginTop: 16 },
  pulseRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  primaryBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 4, width: "100%" },
  primaryBtnText: { fontWeight: "800", fontSize: 15 },
  outlineBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 16 },
  stepsContainer: { marginTop: 20, gap: 12 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepNum: { fontSize: 13, fontWeight: "800" },
  stepText: { fontSize: 13, flex: 1 },
  footerText: { textAlign: "center", fontSize: 11, marginTop: 20 },
});
