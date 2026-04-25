import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

interface DropdownOption {
  id: string;
  label: string;
  tier?: string;
  tierHint?: string;
}

interface ProviderDropdownProps {
  label: string;
  options: DropdownOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export default function ProviderDropdown({
  label,
  options,
  selectedId,
  onSelect,
  disabled = false,
}: ProviderDropdownProps) {
  const [visible, setVisible] = useState(false);
  const selected = options.find((o) => o.id === selectedId);
  const displayLabel = selected?.label || "请选择";

  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={() => !disabled && setVisible(true)}
        style={({ pressed }) => [
          styles.trigger,
          disabled && styles.triggerDisabled,
          pressed && { opacity: 0.7 },
        ]}
        disabled={disabled}
      >
        <Text style={[styles.triggerText, !selected && styles.placeholder]}>
          {displayLabel}
        </Text>
        <Ionicons name="chevron-down" size={14} color={theme.colors.mutedForeground} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <View style={styles.backdropSpacer} />
        </Pressable>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <Pressable
              onPress={() => setVisible(false)}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="close" size={18} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.optionList}
            contentContainerStyle={styles.optionListContent}
            bounces={false}
          >
            {options.map((option) => {
              const isSelected = option.id === selectedId;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    onSelect(option.id);
                    setVisible(false);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    isSelected && styles.optionSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={styles.optionTextWrap}>
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {option.tier && (
                      <Text style={[styles.tierBadge, option.tier === "pro" ? styles.tierPro : styles.tierFast]}>
                        {option.tier === "pro" ? "增强" : "快速"}
                      </Text>
                    )}
                    {option.tierHint && (
                      <Text style={styles.tierHint}>{option.tierHint}</Text>
                    )}
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mutedForeground,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  triggerDisabled: { opacity: 0.5 },
  triggerText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
  },
  placeholder: {
    color: theme.colors.mutedForeground,
  },
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlayBackdrop,
  },
  backdropSpacer: {
    flex: 1,
  },
  sheet: {
    maxHeight: "60%",
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    paddingTop: theme.spacing.lg,
    paddingBottom: Platform.OS === "ios" ? 28 : theme.spacing.lg,
    ...theme.shadow.lg,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sheetTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.muted,
    justifyContent: "center",
    alignItems: "center",
  },
  optionList: {
    flexGrow: 0,
  },
  optionListContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  optionSelected: {
    backgroundColor: theme.colors.primaryMuted,
    borderColor: theme.colors.primary,
  },
  optionTextWrap: {
    flex: 1,
    marginRight: theme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  optionText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  optionTextSelected: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.semibold,
  },
  tierBadge: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    overflow: "hidden",
  },
  tierPro: {
    backgroundColor: "#FF9800",
    color: "#fff",
  },
  tierFast: {
    backgroundColor: "#4CAF50",
    color: "#fff",
  },
  tierHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mutedForeground,
    marginLeft: theme.spacing.xs,
  },
});
