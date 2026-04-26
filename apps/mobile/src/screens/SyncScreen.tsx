import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { requestMobileSync, checkMobileSyncStatus } from "../api/api";
import { WHATSAPP_NUMBER } from "../config";

type SyncStatus = "idle" | "generating" | "waiting" | "success" | "error" | "expired";

interface Props {
  onSynced: (token: string, userId: string) => void;
}

export default function SyncScreen({ onSynced }: Props) {
  const { colors } = useTheme();
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

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  const startSync = async () => {
    setStatus("generating");
    setErrorMsg("");
    stopPolling();

    try {
      const { syncId, otp } = await requestMobileSync();
      syncIdRef.current = syncId;

      // Open WhatsApp with the OTP message pre-filled
      const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=ZOPY-${otp}`;
      await Linking.openURL(waUrl);

      setStatus("waiting");

      // Start polling every 3 seconds
      pollRef.current = setInterval(async () => {
        try {
          const res = await checkMobileSyncStatus(syncId);
          if (res.status === "linked" && res.token && res.userId) {
            stopPolling();
            setStatus("success");
            // Small delay for visual feedback
            setTimeout(() => onSynced(res.token, res.userId!), 1200);
          } else if (res.status === "expired") {
            stopPolling();
            setStatus("expired");
          }
        } catch {
          // Silent — keep polling
        }
      }, 3000);

      // Auto-expire after 5 minutes
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
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Logo area */}
      <View style={styles.logoArea}>
        <Text style={[styles.logo, { color: colors.brand }]}>ZOPY</Text>
        <Text style={[styles.tagline, { color: colors.textMuted }]}>PRINT FROM ANYWHERE</Text>
      </View>

      {/* Card */}
      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
        {status === "idle" && (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Connect WhatsApp</Text>
            <Text style={[styles.desc, { color: colors.textMuted }]}>
              Link your WhatsApp to start printing. Tap the button below — it will open WhatsApp and send a sync code automatically.
            </Text>
            <TouchableOpacity
              style={[styles.syncBtn, { backgroundColor: "#25D366" }]}
              onPress={startSync}
              activeOpacity={0.8}
            >
              <Text style={styles.syncBtnText}>Connect with WhatsApp</Text>
            </TouchableOpacity>
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
              Switch to WhatsApp and send the message. Once you send it, come back here — we'll detect it automatically.
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, { borderColor: colors.border }]}
              onPress={() => {
                stopPolling();
                setStatus("idle");
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Cancel</Text>
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
              style={[styles.syncBtn, { backgroundColor: "#25D366" }]}
              onPress={startSync}
              activeOpacity={0.8}
            >
              <Text style={styles.syncBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === "error" && (
          <View style={styles.centerContent}>
            <Text style={{ fontSize: 48 }}>❌</Text>
            <Text style={[styles.title, { color: colors.text, marginTop: 12 }]}>Sync Failed</Text>
            <Text style={[styles.desc, { color: colors.error }]}>{errorMsg}</Text>
            <TouchableOpacity
              style={[styles.syncBtn, { backgroundColor: "#25D366" }]}
              onPress={startSync}
              activeOpacity={0.8}
            >
              <Text style={styles.syncBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={[styles.footerText, { color: colors.textMuted }]}>
        By continuing, you agree to our Terms of Service
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  logoArea: { alignItems: "center", marginBottom: 32 },
  logo: { fontSize: 40, fontWeight: "900", letterSpacing: 4 },
  tagline: { fontSize: 11, fontWeight: "700", letterSpacing: 3, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 20, padding: 28 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 8 },
  desc: { fontSize: 14, lineHeight: 21, marginBottom: 20 },
  centerContent: { alignItems: "center", paddingVertical: 12 },
  waitText: { fontSize: 14, marginTop: 16 },
  pulseRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  syncBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  syncBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  retryBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 16 },
  footerText: { textAlign: "center", fontSize: 11, marginTop: 20 },
});
