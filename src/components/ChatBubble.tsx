import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CircuitTopology, Message } from "../types";
import { theme } from "../theme";
import MarkdownView from "./MarkdownView";
import CircuitCanvas from "./circuit/CircuitCanvas";

type Props = {
  message: Message;
  onRetry?: (msg: Message) => void;
  onOpenEditor?: (topology: CircuitTopology) => void;
};

function CircuitPreview({ message, onOpenEditor }: { message: Message; onOpenEditor?: (topology: CircuitTopology) => void }) {
  if (!message.circuit) {
    return null;
  }

  return (
    <Pressable
      onPress={() => onOpenEditor?.(message.circuit!)}
      style={styles.circuitPreviewPressable}
    >
      <View style={styles.circuitPreview}>
        <View style={styles.circuitPreviewHeader}>
          <Text style={styles.circuitPreviewTitle}>
            {message.circuit.components.length} 个元件 · {message.circuit.nodes.length} 个节点
          </Text>
          <Text style={styles.circuitPreviewHint}>点击编辑电路拓扑</Text>
        </View>
        <CircuitCanvas topology={message.circuit} compact />
      </View>
    </Pressable>
  );
}

export default function ChatBubble({ message, onRetry, onOpenEditor }: Props) {
  const [showReasoning, setShowReasoning] = useState(true);
  const isUser = message.role === "user";
  const isKimi = message.role === "kimi";
  const isCircuit = message.role === "circuit";
  const isAI = !isUser && !isKimi && !isCircuit;
  const isLoading = message.status === "sending";
  const isError = message.status === "error";

  let avatarLabel = "AI";
  let avatarColor: string = theme.colors.primary;
  if (isUser) {
    avatarLabel = "U";
    avatarColor = theme.colors.foreground;
  } else if (isKimi) {
    avatarLabel = "K";
    avatarColor = "#9C27B0";
  } else if (isCircuit) {
    avatarLabel = "C";
    avatarColor = "#FF9800";
  }

  return (
    <View style={[styles.container, isUser && styles.userContainer]}>
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{avatarLabel}</Text>
        </View>
      )}

      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {isKimi && <Text style={styles.roleLabel}>Kimi 识别</Text>}
        {isCircuit && <Text style={styles.roleLabel}>电路拓扑</Text>}

        {message.image && (
          <Image
            source={{ uri: `data:image/jpeg;base64,${message.image}` }}
            style={styles.imagePreview}
            resizeMode="contain"
          />
        )}

        {isUser && message.content ? <Text style={styles.userText}>{message.content}</Text> : null}

        {(isKimi || isCircuit) && message.content ? (
          <Text style={styles.kimiText}>{message.content}</Text>
        ) : null}

        {message.circuit ? <CircuitPreview message={message} onOpenEditor={onOpenEditor} /> : null}

        {isAI && message.content ? (
          <View style={styles.answerContainer}>
            <MarkdownView content={message.content} />
          </View>
        ) : null}

        {(isAI || isKimi) && message.reasoning ? (
          <View style={styles.reasoningContainer}>
            <Pressable
              onPress={() => setShowReasoning(!showReasoning)}
              style={styles.reasoningHeader}
            >
              <Ionicons
                name={showReasoning ? "chevron-down" : "chevron-forward"}
                size={14}
                color={theme.colors.mutedForeground}
              />
              <Text style={styles.reasoningToggle}> 推理过程</Text>
            </Pressable>
            {showReasoning && <Text style={styles.reasoningText}>{message.reasoning}</Text>}
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loadingContainer}>
            {isKimi ? (
              <>
                <Text style={styles.loadingText}>识别中...</Text>
                <Text style={styles.loadingHint}>较复杂电路可能需要 3~5 分钟，请耐心等待</Text>
              </>
            ) : (
              <Text style={styles.loadingText}>思考中...</Text>
            )}
          </View>
        ) : null}

        {isError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{message.content || "请求失败"}</Text>
            {onRetry && (
              <Pressable onPress={() => onRetry(message)} style={styles.retryBtn}>
                <Text style={styles.retryText}>重试</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <Text
          style={[styles.timestamp, isUser && styles.userTimestamp]}
        >
          {new Date(message.timestamp).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    marginVertical: 5,
    paddingHorizontal: theme.spacing.md,
  },
  userContainer: { justifyContent: "flex-end" },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
    marginRight: theme.spacing.xs,
  },
  avatarText: { color: "#fff", fontSize: 11, fontWeight: theme.fontWeight.bold },
  bubble: {
    maxWidth: "94%",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderRadius: theme.radius.xl,
  },
  userBubble: {
    backgroundColor: theme.colors.userBubble,
    borderBottomRightRadius: theme.radius.sm,
  },
  aiBubble: {
    backgroundColor: theme.colors.aiBubble,
    borderBottomLeftRadius: theme.radius.sm,
  },
  roleLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: "#9C27B0",
    marginBottom: theme.spacing.xs,
    letterSpacing: 0.3,
  },
  userText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.userBubbleText,
    lineHeight: 21,
  },
  kimiText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
    lineHeight: 21,
  },
  imagePreview: {
    width: 200,
    height: 200,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.xs,
  },
  circuitPreviewPressable: {
    width: "100%",
  },
  circuitPreview: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  circuitPreviewHeader: {
    marginBottom: theme.spacing.sm,
  },
  circuitPreviewTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: "#7B1FA2",
  },
  circuitPreviewHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.primary,
    marginTop: 2,
    fontWeight: theme.fontWeight.medium,
  },
  reasoningContainer: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  reasoningHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  reasoningToggle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
    fontWeight: theme.fontWeight.medium,
  },
  reasoningText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
    lineHeight: 19,
    padding: theme.spacing.md,
    paddingTop: 0,
    fontStyle: "italic",
  },
  answerContainer: {
    marginTop: theme.spacing.xs,
  },
  loadingContainer: {
    paddingVertical: theme.spacing.md,
  },
  loadingText: { fontSize: theme.fontSize.base, color: theme.colors.mutedForeground },
  loadingHint: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
    marginTop: 4,
    fontStyle: "italic",
  },
  errorContainer: {
    backgroundColor: theme.colors.destructiveMuted,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginVertical: theme.spacing.xs,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.destructive,
    marginBottom: theme.spacing.xs,
  },
  retryBtn: {
    backgroundColor: theme.colors.destructive,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.md,
    alignSelf: "flex-start",
  },
  retryText: { color: "#fff", fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  timestamp: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mutedForeground,
    marginTop: theme.spacing.xs,
    textAlign: "right",
  },
  userTimestamp: {
    color: "rgba(255,255,255,0.7)",
  },
});
