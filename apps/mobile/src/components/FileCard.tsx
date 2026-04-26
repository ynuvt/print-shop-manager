import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { FileText, SlidersHorizontal, X } from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import ToggleGroup from "./ToggleGroup";
import type { PrintFileState, PrintOptions } from "@printowl/shared-utils";
import { calculateFileCost } from "@printowl/shared-utils";

type Props = {
  pf: PrintFileState;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<PrintOptions>) => void;
  onRemove: () => void;
};

export default function FileCard({ pf, expanded, onToggle, onUpdate, onRemove }: Props) {
  const { colors, isDark } = useTheme();
  const cost = calculateFileCost(pf.detectedPages, pf.options);

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.panelMuted }]}>
      {/* ── Header ── */}
      <View style={styles.head}>
        <TouchableOpacity style={styles.titleBtn} activeOpacity={0.7} onPress={onToggle}>
          <View style={[styles.fileIcon, { backgroundColor: `${colors.brand}22` }]}>
            <FileText size={16} color={colors.brand} />
          </View>
          <View style={styles.titleText}>
            <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
              {pf.name}
            </Text>
            <Text style={[styles.fileMeta, { color: colors.textMuted }]}>
              {pf.detectedPages} pages • Rs {cost}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.editBtn, { borderColor: `${colors.brand}55` }]}
            onPress={onToggle}
            activeOpacity={0.7}
          >
            <SlidersHorizontal size={10} color={colors.brand} />
            <Text style={[styles.editLabel, { color: colors.text }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.removeBtn, { borderColor: colors.border }]}
            onPress={onRemove}
            activeOpacity={0.7}
          >
            <X size={14} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Expanded Options ── */}
      {expanded && (
        <View style={[styles.body, { borderTopColor: colors.border }]}>
          <View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Print Sides</Text>
            <ToggleGroup
              options={[
                { label: "One Side", value: "ONE" },
                { label: "Both Sides", value: "BOTH" },
              ]}
              value={pf.options.duplex}
              onChange={(v) => onUpdate({ duplex: v })}
            />
          </View>

          <View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Orientation</Text>
            <ToggleGroup
              options={[
                { label: "Vertical", value: "PORTRAIT" },
                { label: "Horizontal", value: "LANDSCAPE" },
              ]}
              value={pf.options.orientation}
              onChange={(v) => onUpdate({ orientation: v })}
            />
          </View>

          <View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Scale</Text>
            <ToggleGroup
              options={[
                { label: "Fit to paper", value: "FIT" },
                { label: "Original size", value: "NOSCALE" },
              ]}
              value={pf.options.scaleMode}
              onChange={(v) => onUpdate({ scaleMode: v })}
            />
          </View>

          <View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Page Range</Text>
            <ToggleGroup
              options={[
                { label: "All Pages", value: "ALL" },
                { label: "Custom", value: "CUSTOM" },
              ]}
              value={pf.options.pageRange}
              onChange={(v) => onUpdate({ pageRange: v, customRange: "" })}
            />
            {pf.options.pageRange === "CUSTOM" && (
              <View style={styles.fieldSpacing}>
                <TextInput
                  value={pf.options.customRange ?? ""}
                  onChangeText={(text) => onUpdate({ customRange: text })}
                  placeholder={`1-5, 8, 10-12 (total ${pf.detectedPages} pages)`}
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.panel,
                      color: colors.text,
                      borderColor: pf.pageRangeError ? colors.error : colors.border,
                    },
                  ]}
                  keyboardType="default"
                  autoCapitalize="none"
                />
                {pf.pageRangeError ? (
                  <Text style={[styles.fieldError, { color: colors.error }]}>
                    {pf.pageRangeError}
                  </Text>
                ) : null}
              </View>
            )}
          </View>

          <View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Copies</Text>
            <View style={styles.counter}>
              <TouchableOpacity
                style={[styles.counterBtn, { borderColor: colors.border, backgroundColor: colors.panel }]}
                onPress={() => onUpdate({ copies: Math.max(1, pf.options.copies - 1) })}
                activeOpacity={0.7}
              >
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600" }}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.counterValue, { color: colors.text }]}>{pf.options.copies}</Text>
              <TouchableOpacity
                style={[styles.counterBtn, { borderColor: colors.border, backgroundColor: colors.panel }]}
                onPress={() => onUpdate({ copies: pf.options.copies + 1 })}
                activeOpacity={0.7}
              >
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600" }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    gap: 8,
  },
  titleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  fileIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 13,
    fontWeight: "700",
  },
  fileMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  editLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  removeBtn: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    borderTopWidth: 1,
    padding: 12,
    gap: 14,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  fieldSpacing: {
    marginTop: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
  },
  fieldError: {
    fontSize: 12,
    marginTop: 4,
  },
  counter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  counterBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: {
    fontSize: 16,
    fontWeight: "600",
    minWidth: 28,
    textAlign: "center",
  },
});
