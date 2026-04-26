import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 6 }}>{title}</Text>
      {children}
    </View>
  );
}

export default function TermsScreen() {
  const { colors } = useTheme();
  const p = { color: colors.text, fontSize: 13, lineHeight: 21, marginTop: 4 };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 8, gap: 12 }}>
      {/* Terms */}
      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
        <Text style={[styles.h1, { color: colors.text }]}>Terms of Service</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Effective: 04/04/2026</Text>
        <Text style={p}>
          These Terms govern your use of Zopy Prints. By using the platform, you agree to these Terms.
        </Text>
        <LegalSection title="1. Eligibility">
          <Text style={p}>Must be 18+ and legally capable of entering contracts under Indian law.</Text>
        </LegalSection>
        <LegalSection title="2. Account">
          <Text style={p}>Provide accurate info. Keep credentials confidential. You are responsible for all activity.</Text>
        </LegalSection>
        <LegalSection title="3. Use">
          <Text style={p}>Use only for lawful print job purposes. Do not upload illegal content or attempt to hack the platform.</Text>
        </LegalSection>
        <LegalSection title="4. Liability">
          <Text style={p}>Zopy is not liable for indirect damages. Platform is provided "as is."</Text>
        </LegalSection>
        <LegalSection title="5. Contact">
          <Text style={p}>zopy.queries@gmail.com</Text>
        </LegalSection>
      </View>

      {/* Privacy */}
      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
        <Text style={[styles.h1, { color: colors.text }]}>Privacy Policy</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Effective: 04/04/2026</Text>
        <Text style={p}>
          We collect account details and uploaded documents solely for print job processing.
          Documents are deleted after completion. We do not sell data to third parties.
        </Text>
        <LegalSection title="Your Rights">
          <Text style={p}>Access, correct, or delete your data by contacting zopy.queries@gmail.com.</Text>
        </LegalSection>
      </View>

      {/* Refund */}
      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
        <Text style={[styles.h1, { color: colors.text }]}>Refund Policy</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Effective: 04/04/2026</Text>
        <Text style={p}>
          7-day money-back guarantee on new subscriptions. After 7 days, fees are non-refundable.
          Contact zopy.queries@gmail.com for refund requests.
        </Text>
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16 },
  h1: { fontSize: 20, fontWeight: "800", marginBottom: 2 },
});
