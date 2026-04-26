import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Eye, Lightbulb, Mail, Rocket, Sparkles, Target, Users, Zap } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

type Props = NativeStackScreenProps<any, "About">;

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {icon}
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function AboutScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const p = { color: colors.text, fontSize: 14, lineHeight: 22, marginTop: 4 };
  const li = { color: colors.text, fontSize: 14, lineHeight: 22 };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
        <Text style={[styles.h1, { color: colors.text }]}>About Zopy</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          Remote printing made simple for students and local vendors.
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }}>
          <Sparkles size={16} color={colors.brand} />
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 }}>
            At Zopy, we believe printing should be as simple as sending a message.
          </Text>
        </View>

        <View style={styles.list}>
          <Text style={li}>• No more waiting in long queues.</Text>
          <Text style={li}>• No more rushing to shops.</Text>
          <Text style={li}>• No more last-minute stress.</Text>
        </View>

        <Section icon={<Rocket size={16} color={colors.brand} />} title="What We Do">
          <Text style={p}>Upload documents, customize settings, get an OTP, and collect prints instantly.</Text>
        </Section>

        <Section icon={<Target size={16} color={colors.brand} />} title="Our Mission">
          <Text style={p}>Instant, accessible, and stress-free printing for everyone.</Text>
        </Section>

        <Section icon={<Lightbulb size={16} color={colors.brand} />} title="Why Zopy Exists">
          <Text style={p}>We created Zopy to give you control instead of chaos.</Text>
        </Section>

        <Section icon={<Users size={16} color={colors.brand} />} title="For Users & Shops">
          <Text style={p}>
            <Text style={{ fontWeight: "700" }}>Users:</Text> Print from anywhere.{"\n"}
            <Text style={{ fontWeight: "700" }}>Shopkeepers:</Text> Organized orders, faster service.
          </Text>
        </Section>

        <Section icon={<Eye size={16} color={colors.brand} />} title="Our Vision">
          <Text style={p}>To become the default way people print documents.</Text>
        </Section>

        <Section icon={<Zap size={16} color={colors.brand} />} title="Built for Speed">
          <Text style={p}>Zopy is not just a tool — it's a smarter way to get things done.</Text>
        </Section>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20 }}>
          <Mail size={16} color={colors.brand} />
          <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>
            Contact: zopy.queries@gmail.com
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginVertical: 20 }}>
        <TouchableOpacity onPress={() => navigation.navigate("Terms")} style={[styles.footerBtn, { borderColor: colors.border }]}>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>Terms</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16 },
  h1: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  list: { marginTop: 8, gap: 4, paddingLeft: 4 },
  footerBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  footerText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
});
