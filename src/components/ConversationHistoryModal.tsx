import React from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ConversationSummary } from "../types";
import { theme } from "../theme";

type Props = {
  visible: boolean;
  conversations: ConversationSummary[];
  activeConversationId: string;
  onSelectConversation: (conversationId: string) => void;
  onClose: () => void;
};

function formatUpdatedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ConversationHistoryModal({
  visible,
  conversations,
  activeConversationId,
  onSelectConversation,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPressable} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>历史对话</Text>
              <Text style={styles.subtitle}>点击即可恢复到对应会话</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={18} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const active = item.id === activeConversationId;
              return (
                <Pressable
                  onPress={() => onSelectConversation(item.id)}
                  style={[styles.item, active ? styles.activeItem : null]}
                >
                  <View style={styles.itemTextWrap}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.itemPreview} numberOfLines={2}>
                      {item.preview}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {item.messageCount} 条消息 · {formatUpdatedAt(item.updatedAt)}
                    </Text>
                  </View>
                  {active ? (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>当前</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedForeground} />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="chatbubble-ellipses-outline" size={24} color={theme.colors.mutedForeground} />
                <Text style={styles.emptyTitle}>还没有历史对话</Text>
                <Text style={styles.emptyText}>发送第一条消息后，这里会自动保存会话记录。</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.22)",
    justifyContent: "flex-end",
  },
  backdropPressable: {
    flex: 1,
  },
  sheet: {
    maxHeight: "78%",
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    paddingTop: theme.spacing.lg,
    paddingBottom: Platform.OS === "ios" ? 28 : theme.spacing.lg,
    ...theme.shadow.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  subtitle: {
    marginTop: 2,
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.muted,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  activeItem: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryMuted,
  },
  itemTextWrap: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  itemTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  itemPreview: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
    lineHeight: 18,
    marginTop: 4,
  },
  itemMeta: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mutedForeground,
    marginTop: theme.spacing.xs,
  },
  activeBadge: {
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeBadgeText: {
    color: theme.colors.primaryForeground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  emptyText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
    textAlign: "center",
    lineHeight: 20,
  },
});
