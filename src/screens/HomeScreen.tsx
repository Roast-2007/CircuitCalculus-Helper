import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat, ImageResult } from "expo-image-manipulator";
import { buildDeepSeekCircuitPrompt, createCircuitTopology } from "../services/circuitSerialize";
import { loadKeys } from "../services/storage";
import { streamSiliconFlowKimi, streamDeepSeek, CancelFn } from "../services/api";
import { parseKimiResponse } from "../services/circuitParser";
import {
  createConversation,
  loadConversationState,
  replaceConversation,
  saveConversationState,
  summarizeConversation,
  upsertConversationMessages,
} from "../services/conversationStorage";
import { Conversation, CircuitTopology, Message } from "../types";
import { theme } from "../theme";
import ChatBubble from "../components/ChatBubble";
import CircuitEditor from "../components/CircuitEditor";
import ConversationHistoryModal from "../components/ConversationHistoryModal";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function normalizePickedImage(uri: string) {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    {
      compress: 0.6,
      format: SaveFormat.JPEG,
      base64: true,
    }
  );

  return {
    uri: result.uri,
    base64: result.base64 || "",
  };
}

export default function HomeScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [conversationStateReady, setConversationStateReady] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [inputText, setInputText] = useState("");
  const [pendingImageData, setPendingImageData] = useState<{
    uri: string;
    base64: string;
  } | null>(null);
  const [processing, setProcessing] = useState(false);
  const flatListRef = useRef<FlatList<Message>>(null);
  const activeKimiCancelRef = useRef<CancelFn | null>(null);
  const activeDeepSeekCancelRef = useRef<CancelFn | null>(null);
  const saveAlertShownRef = useRef(false);

  const [reviewData, setReviewData] = useState<{
    description: string;
    topology: CircuitTopology | null;
    userText: string;
    image: string;
  } | null>(null);
  const [reviewEditText, setReviewEditText] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [switchToCircuitEdit, setSwitchToCircuitEdit] = useState(false);
  const [editingMessageCircuit, setEditingMessageCircuit] = useState<CircuitTopology | null>(null);
  const [showCircuitEditorModal, setShowCircuitEditorModal] = useState(false);

  const activeConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === activeConversationId) ||
      conversations[0] ||
      null,
    [conversations, activeConversationId]
  );
  const messages = activeConversation?.messages || [];
  const conversationSummaries = useMemo(
    () => conversations.map(summarizeConversation),
    [conversations]
  );

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const scrollToTop = useCallback((animated = false) => {
    setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated }), 40);
  }, []);

  const clearActiveStreams = useCallback(() => {
    activeKimiCancelRef.current?.();
    activeDeepSeekCancelRef.current?.();
    activeKimiCancelRef.current = null;
    activeDeepSeekCancelRef.current = null;
  }, []);

  const resetReviewState = useCallback(() => {
    setReviewData(null);
    setReviewEditText("");
    setReviewNotes("");
    setShowReviewModal(false);
    setSwitchToCircuitEdit(false);
    setEditingMessageCircuit(null);
    setShowCircuitEditorModal(false);
  }, []);

  const resetComposerState = useCallback(() => {
    setInputText("");
    setPendingImageData(null);
  }, []);

  const stopActiveInteraction = useCallback(() => {
    clearActiveStreams();
    setProcessing(false);
    resetComposerState();
    resetReviewState();
  }, [clearActiveStreams, resetComposerState, resetReviewState]);

  const updateActiveConversationMessages = useCallback(
    (updater: (messages: Message[]) => Message[]) => {
      setConversations((currentConversations) => {
        const currentConversation =
          currentConversations.find((conversation) => conversation.id === activeConversationId) ||
          currentConversations[0];

        if (!currentConversation) {
          return currentConversations;
        }

        const nextConversation = upsertConversationMessages(
          currentConversation,
          updater(currentConversation.messages)
        );
        return replaceConversation(currentConversations, nextConversation);
      });
    },
    [activeConversationId]
  );

  const addMessage = useCallback(
    (message: Message) => {
      updateActiveConversationMessages((currentMessages) => [...currentMessages, message]);
      scrollToBottom();
    },
    [scrollToBottom, updateActiveConversationMessages]
  );

  const updateMessage = useCallback(
    (id: string, update: Partial<Message>) => {
      updateActiveConversationMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === id ? { ...message, ...update } : message
        )
      );
    },
    [updateActiveConversationMessages]
  );

  const handleOpenEditor = useCallback((topology: CircuitTopology) => {
    setEditingMessageCircuit(topology);
    setShowCircuitEditorModal(true);
  }, []);

  const handleCloseCircuitEditorModal = useCallback(() => {
    setShowCircuitEditorModal(false);
    setEditingMessageCircuit(null);
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const [conversationState, [camera, media]] = await Promise.all([
        loadConversationState(),
        Promise.all([
          ImagePicker.requestCameraPermissionsAsync(),
          ImagePicker.requestMediaLibraryPermissionsAsync(),
        ]),
      ]);

      if (!alive) {
        return;
      }

      setConversations(conversationState.conversations);
      setActiveConversationId(conversationState.activeConversationId);
      setConversationStateReady(true);

      if (!camera.granted) {
        Alert.alert("权限提示", "需要相机权限才能拍照");
      }

      if (!media.granted) {
        Alert.alert("权限提示", "需要相册权限才能选择图片");
      }
    })();

    return () => {
      alive = false;
      activeKimiCancelRef.current?.();
      activeDeepSeekCancelRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!conversationStateReady) {
      return;
    }

    if (conversations.length === 0) {
      const initialConversation = createConversation();
      setConversations([initialConversation]);
      setActiveConversationId(initialConversation.id);
      return;
    }

    if (!conversations.some((conversation) => conversation.id === activeConversationId)) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations, activeConversationId, conversationStateReady]);

  useEffect(() => {
    if (!conversationStateReady || !activeConversationId || conversations.length === 0) {
      return;
    }

    const timer = setTimeout(() => {
      saveConversationState({ conversations, activeConversationId })
        .then(() => {
          saveAlertShownRef.current = false;
        })
        .catch(() => {
          if (!saveAlertShownRef.current) {
            saveAlertShownRef.current = true;
            Alert.alert(
              "保存失败",
              "本地会话记录保存失败，本次对话可能不会在下次打开应用时保留。"
            );
          }
        });
    }, 160);

    return () => clearTimeout(timer);
  }, [conversations, activeConversationId, conversationStateReady]);

  const pickImage = useCallback(
    async (fromCamera: boolean) => {
      if (processing) {
        return;
      }

      const launcher = fromCamera
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;
      const result = await launcher({
        mediaTypes: ["images"],
        quality: 0.9,
        base64: false,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        const normalizedImage = await normalizePickedImage(result.assets[0].uri);
        if (!normalizedImage.base64) {
          Alert.alert("图片处理失败", "暂时无法读取这张图片，请换一张再试。");
          return;
        }
        setPendingImageData(normalizedImage);
      }
    },
    [processing]
  );

  const pickFromCamera = useCallback(() => pickImage(true), [pickImage]);
  const pickFromGallery = useCallback(() => pickImage(false), [pickImage]);

  const cancelPendingImage = useCallback(() => {
    setPendingImageData(null);
  }, []);

  const startDeepSeekStream = useCallback(
    async (messageId: string, problemText: string) => {
      const keys = await loadKeys();
      activeDeepSeekCancelRef.current?.();
      activeDeepSeekCancelRef.current = streamDeepSeek(
        problemText,
        keys.deepseekModel,
        keys.deepseekKey,
        (reasoning) => updateMessage(messageId, { reasoning }),
        (content) => updateMessage(messageId, { content }),
        () => {
          updateMessage(messageId, { status: "sent" });
          activeDeepSeekCancelRef.current = null;
          setProcessing(false);
        },
        (error) => {
          updateMessage(messageId, { content: error.message, status: "error" });
          activeDeepSeekCancelRef.current = null;
          setProcessing(false);
        }
      );
    },
    [updateMessage]
  );

  const handleCircuitConfirm = useCallback(
    async (topology: CircuitTopology, notes: string) => {
      if (!reviewData) {
        return;
      }

      setShowReviewModal(false);
      const problemText = buildDeepSeekCircuitPrompt(topology, reviewData.userText, notes);
      setProcessing(true);

      const aiMessageId = generateId();
      addMessage({
        id: aiMessageId,
        role: "assistant",
        content: "",
        reasoning: "",
        timestamp: Date.now(),
        status: "sending",
      });

      await startDeepSeekStream(aiMessageId, problemText);
    },
    [reviewData, addMessage, startDeepSeekStream]
  );

  const handleMessageCircuitConfirm = useCallback(
    (topology: CircuitTopology) => {
      setShowCircuitEditorModal(false);
      setEditingMessageCircuit(null);
      setProcessing(true);

      const aiMessageId = generateId();
      addMessage({
        id: aiMessageId,
        role: "assistant",
        content: "",
        reasoning: "",
        timestamp: Date.now(),
        status: "sending",
      });

      startDeepSeekStream(aiMessageId, buildDeepSeekCircuitPrompt(topology, "", ""));
    },
    [addMessage, startDeepSeekStream]
  );

  const handleTextConfirm = useCallback(async () => {
    if (!reviewData) {
      return;
    }

    setShowReviewModal(false);
    const problemText = [
      reviewEditText || reviewData.description,
      reviewData.userText ? `\n\n## 用户问题\n\n${reviewData.userText}` : "",
      reviewNotes ? `\n\n## 用户补充\n\n${reviewNotes}` : "",
    ]
      .filter(Boolean)
      .join("");

    setProcessing(true);
    const aiMessageId = generateId();
    addMessage({
      id: aiMessageId,
      role: "assistant",
      content: "",
      reasoning: "",
      timestamp: Date.now(),
      status: "sending",
    });

    await startDeepSeekStream(aiMessageId, problemText);
  }, [reviewData, reviewEditText, reviewNotes, addMessage, startDeepSeekStream]);

  const handleReviewCancel = useCallback(() => {
    resetReviewState();
    clearActiveStreams();
    setProcessing(false);
  }, [clearActiveStreams, resetReviewState]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!pendingImageData && !text) {
      return;
    }

    clearActiveStreams();
    const keys = await loadKeys();

    if (!pendingImageData) {
      if (!keys.deepseekKey.trim()) {
        Alert.alert("提示", "请先在设置中配置 DeepSeek API Key");
        return;
      }

      setInputText("");
      setProcessing(true);
      addMessage({
        id: generateId(),
        role: "user",
        content: text,
        timestamp: Date.now(),
        status: "sent",
      });

      const aiMessageId = generateId();
      addMessage({
        id: aiMessageId,
        role: "assistant",
        content: "",
        reasoning: "",
        timestamp: Date.now(),
        status: "sending",
      });

      await startDeepSeekStream(aiMessageId, text);
      return;
    }

    if (!keys.siliconflowKey.trim()) {
      Alert.alert("提示", "请先在设置中配置硅基流动 API Key");
      return;
    }

    if (!keys.deepseekKey.trim()) {
      Alert.alert("提示", "请先在设置中配置 DeepSeek API Key");
      return;
    }

    const imageBase64 = pendingImageData.base64;
    const userText = text;
    setPendingImageData(null);
    setInputText("");
    setProcessing(true);

    addMessage({
      id: generateId(),
      role: "user",
      content: userText,
      image: imageBase64,
      timestamp: Date.now(),
      status: "sent",
    });

    const kimiMessageId = generateId();
    addMessage({
      id: kimiMessageId,
      role: "kimi",
      content: "",
      timestamp: Date.now(),
      status: "sending",
    });

    let fullDescription = "";
    activeKimiCancelRef.current?.();
    activeKimiCancelRef.current = streamSiliconFlowKimi(
      imageBase64,
      keys.siliconflowModel,
      keys.siliconflowKey,
      "circuit",
      (content) => {
        fullDescription = content;
        updateMessage(kimiMessageId, { content });
      },
      () => {
        updateMessage(kimiMessageId, { status: "sent" });
        activeKimiCancelRef.current = null;

        const result = parseKimiResponse(fullDescription);
        if (result.isCircuit && result.topology) {
          updateMessage(kimiMessageId, { circuit: result.topology });
          setReviewData({
            description: fullDescription,
            topology: result.topology,
            userText,
            image: imageBase64,
          });
          setReviewEditText(fullDescription);
          setReviewNotes("");
          setSwitchToCircuitEdit(false);
          setShowReviewModal(true);
          setProcessing(false);
          return;
        }

        const contentText = result.extractedText || fullDescription;
        const combinedText = [contentText, userText ? `\n\n## 用户问题\n\n${userText}` : ""]
          .filter(Boolean)
          .join("");

        const aiMessageId = generateId();
        addMessage({
          id: aiMessageId,
          role: "assistant",
          content: "",
          reasoning: "",
          timestamp: Date.now(),
          status: "sending",
        });

        startDeepSeekStream(aiMessageId, combinedText);
      },
      (error) => {
        updateMessage(kimiMessageId, { content: error.message, status: "error" });
        activeKimiCancelRef.current = null;
        setProcessing(false);
      }
    );
  }, [
    inputText,
    pendingImageData,
    clearActiveStreams,
    addMessage,
    startDeepSeekStream,
    updateMessage,
  ]);

  const retryMessage = useCallback(
    async (message: Message) => {
      const messageIndex = messages.findIndex((item) => item.id === message.id);
      const userMessages = messages.slice(0, messageIndex).filter((item) => item.role === "user");
      const lastUserMessage = userMessages[userMessages.length - 1];

      if (lastUserMessage?.image) {
        setPendingImageData({ uri: "", base64: lastUserMessage.image });
        setInputText(lastUserMessage.content || "");
        return;
      }

      if (lastUserMessage?.content) {
        setInputText(lastUserMessage.content);
      }
    },
    [messages]
  );

  const handleNewConversation = useCallback(() => {
    stopActiveInteraction();
    const nextConversation = createConversation();
    setConversations((currentConversations) => replaceConversation(currentConversations, nextConversation));
    setActiveConversationId(nextConversation.id);
    setShowHistoryModal(false);
    scrollToTop(false);
  }, [stopActiveInteraction, scrollToTop]);

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      if (conversationId === activeConversationId) {
        setShowHistoryModal(false);
        return;
      }

      stopActiveInteraction();
      setActiveConversationId(conversationId);
      setShowHistoryModal(false);
    },
    [activeConversationId, stopActiveInteraction]
  );

  const clearChat = useCallback(() => {
    Alert.alert("清空当前对话", "确定要清空当前会话的所有消息吗？历史对话会保留。", [
      { text: "取消", style: "cancel" },
      {
        text: "确定",
        style: "destructive",
        onPress: () => {
          stopActiveInteraction();
          updateActiveConversationMessages(() => []);
          scrollToTop(false);
        },
      },
    ]);
  }, [stopActiveInteraction, updateActiveConversationMessages, scrollToTop]);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <ChatBubble message={item} onRetry={retryMessage} onOpenEditor={handleOpenEditor} />
    ),
    [retryMessage, handleOpenEditor]
  );

  const handleContentSizeChange = useCallback(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  const contentContainerStyle = useMemo(
    () => [
      styles.messageContent,
      messages.length === 0 ? styles.emptyContent : null,
    ],
    [messages.length]
  );

  const hasTopology = reviewData?.topology !== null && reviewData?.topology !== undefined;
  const showCircuitEditor = hasTopology || switchToCircuitEdit;
  const circuitEditorTopology: CircuitTopology | undefined =
    reviewData?.topology ||
    (switchToCircuitEdit && reviewData
      ? createCircuitTopology({
          rawDescription: reviewEditText || reviewData.description,
          components: [],
          connections: [],
          nodes: [],
        })
      : undefined);

  const handleSwitchToCircuitMode = useCallback(() => {
    setSwitchToCircuitEdit(true);
  }, []);

  if (!conversationStateReady) {
    return (
      <View style={styles.loadingState}>
        <View style={styles.loadingCircle}>
          <Ionicons name="chatbubble-ellipses-outline" size={24} color={theme.colors.primary} />
        </View>
        <Text style={styles.loadingTitle}>正在恢复会话</Text>
        <Text style={styles.loadingText}>本地历史记录加载中...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>数学电路助手</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {activeConversation?.title || "新对话"}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setShowHistoryModal(true)} style={styles.headerActionChip}>
            <Ionicons name="time-outline" size={14} color={theme.colors.foreground} />
            <Text style={styles.headerActionText}>历史</Text>
          </Pressable>
          <Pressable
            onPress={handleNewConversation}
            style={[styles.headerActionChip, styles.headerActionPrimary]}
          >
            <Ionicons name="add" size={14} color={theme.colors.primary} />
            <Text style={[styles.headerActionText, styles.headerActionPrimaryText]}>新对话</Text>
          </Pressable>
          <Pressable onPress={clearChat} style={styles.clearBtn}>
            <Ionicons name="trash-outline" size={16} color={theme.colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <View style={styles.scanHint}>
        <Ionicons name="document-text-outline" size={14} color={theme.colors.primary} />
        <View style={styles.scanHintTextWrap}>
          <Text style={styles.scanHintText}>
            建议使用「全能扫描王」等应用预处理图片后再上传，可显著提升识别准确率
          </Text>
          <Text style={styles.scanHintSubText}>
            新的题请开启新对话，不要反复使用同一个对话窗口，否则会影响识别与解答准确率
          </Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(message) => message.id}
        renderItem={renderItem}
        style={styles.messageList}
        contentContainerStyle={contentContainerStyle}
        ListEmptyComponent={
          <View style={styles.emptyView}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="school-outline" size={30} color={theme.colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>数学电路助手</Text>
            <Text style={styles.emptySubtitle}>
              拍照或从相册选择数学题 / 电路图{"\n"}
              也可以直接输入文字提问
            </Text>
          </View>
        }
        onContentSizeChange={handleContentSizeChange}
      />

      <View style={styles.inputBar}>
        {pendingImageData ? (
          <View style={styles.pendingImageContainer}>
            <Image source={{ uri: pendingImageData.uri }} style={styles.pendingImage} />
            <Pressable onPress={cancelPendingImage} style={styles.removeImageBtn}>
              <Ionicons name="close" size={10} color="#fff" />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.inputRow}>
          <Pressable onPress={pickFromCamera} style={styles.iconBtn} disabled={processing}>
            <Ionicons name="camera-outline" size={20} color={theme.colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={pickFromGallery} style={styles.iconBtn} disabled={processing}>
            <Ionicons name="image-outline" size={20} color={theme.colors.mutedForeground} />
          </Pressable>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={pendingImageData ? "补充题目信息..." : "输入题目或补充信息..."}
            placeholderTextColor={theme.colors.mutedForeground}
            multiline
            maxLength={2000}
            editable={!processing}
          />
          <Pressable
            onPress={handleSend}
            style={[
              styles.sendBtn,
              (!inputText.trim() && !pendingImageData) || processing
                ? styles.sendBtnDisabled
                : null,
            ]}
            disabled={(!inputText.trim() && !pendingImageData) || processing}
          >
            <Ionicons name="send" size={18} color={theme.colors.primaryForeground} />
          </Pressable>
        </View>
      </View>

      <ConversationHistoryModal
        visible={showHistoryModal}
        conversations={conversationSummaries}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onClose={() => setShowHistoryModal(false)}
      />

      <Modal
        visible={showCircuitEditorModal}
        animationType="slide"
        onRequestClose={handleCloseCircuitEditorModal}
      >
        {editingMessageCircuit ? (
          <CircuitEditor
            topology={editingMessageCircuit}
            onConfirm={handleMessageCircuitConfirm}
            onCancel={handleCloseCircuitEditorModal}
          />
        ) : null}
      </Modal>

      <Modal visible={showReviewModal} animationType="slide" onRequestClose={handleReviewCancel}>
        {showCircuitEditor && circuitEditorTopology ? (
          <CircuitEditor
            topology={circuitEditorTopology}
            onConfirm={handleCircuitConfirm}
            onCancel={handleReviewCancel}
          />
        ) : (
          <View style={styles.reviewContainer}>
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewTitle}>确认题目信息</Text>
              <Pressable onPress={handleReviewCancel}>
                <Text style={styles.reviewCancelText}>取消</Text>
              </Pressable>
            </View>

            <Text style={styles.reviewLabel}>识别结果（可编辑）</Text>
            <TextInput
              style={styles.reviewTextInput}
              value={reviewEditText}
              onChangeText={setReviewEditText}
              multiline
              placeholder="图片识别结果..."
              placeholderTextColor={theme.colors.mutedForeground}
              textAlignVertical="top"
            />

            <Text style={styles.reviewLabel}>补充信息（可选）</Text>
            <TextInput
              style={styles.reviewNotesInput}
              value={reviewNotes}
              onChangeText={setReviewNotes}
              multiline
              placeholder="可以补充题目条件、求解目标等..."
              placeholderTextColor={theme.colors.mutedForeground}
              textAlignVertical="top"
            />

            <Pressable onPress={handleSwitchToCircuitMode} style={styles.switchToCircuitBtn}>
              <Ionicons name="git-network-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.switchToCircuitBtnText}> 编辑电路拓扑</Text>
            </Pressable>

            <Pressable onPress={handleTextConfirm} style={styles.reviewConfirmBtn}>
              <Text style={styles.reviewConfirmBtnText}>确认并提交 DeepSeek 解答</Text>
            </Pressable>
          </View>
        )}
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  loadingState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.xl,
  },
  loadingCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primaryMuted,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  loadingTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  loadingText: {
    marginTop: theme.spacing.xs,
    fontSize: theme.fontSize.base,
    color: theme.colors.mutedForeground,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingTop: Platform.OS === "android" ? 44 : 12,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTextWrap: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  headerTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.headerText,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: theme.fontSize.sm,
    color: theme.colors.mutedForeground,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  headerActionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.full,
    paddingHorizontal: 10,
    height: 32,
  },
  headerActionPrimary: {
    backgroundColor: theme.colors.primaryMuted,
  },
  headerActionText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  headerActionPrimaryText: {
    color: theme.colors.primary,
  },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.muted,
    justifyContent: "center",
    alignItems: "center",
  },
  scanHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.primaryMuted,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  scanHintTextWrap: {
    flex: 1,
  },
  scanHintText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 17,
  },
  scanHintSubText: {
    marginTop: 2,
    fontSize: theme.fontSize.xs,
    color: theme.colors.primary,
    lineHeight: 17,
    opacity: 0.82,
  },
  messageList: { flex: 1 },
  messageContent: {
    flexGrow: 1,
    paddingVertical: theme.spacing.sm,
  },
  emptyContent: {
    justifyContent: "center",
  },
  emptyView: {
    alignItems: "center",
    paddingHorizontal: 48,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primaryMuted,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  emptyTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.foreground,
    marginBottom: theme.spacing.sm,
  },
  emptySubtitle: {
    fontSize: theme.fontSize.base,
    color: theme.colors.mutedForeground,
    textAlign: "center",
    lineHeight: 22,
  },
  inputBar: {
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: Platform.OS === "android" ? theme.spacing.sm : 20,
  },
  pendingImageContainer: {
    position: "relative",
    alignSelf: "flex-start",
    marginBottom: theme.spacing.xs,
  },
  pendingImage: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  removeImageBtn: {
    position: "absolute",
    top: -7,
    right: -7,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.destructive,
    justifyContent: "center",
    alignItems: "center",
    ...theme.shadow.sm,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing.xs,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.muted,
    justifyContent: "center",
    alignItems: "center",
  },
  textInput: {
    flex: 1,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
    lineHeight: 20,
  },
  sendBtn: {
    backgroundColor: theme.colors.primary,
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.5 },
  reviewContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: Platform.OS === "android" ? 48 : 60,
    paddingHorizontal: theme.spacing.lg,
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.xl,
  },
  reviewTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  reviewCancelText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.medium,
  },
  reviewLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.mutedForeground,
    marginBottom: theme.spacing.xs,
  },
  reviewTextInput: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 200,
    maxHeight: 300,
    marginBottom: theme.spacing.lg,
    lineHeight: 22,
  },
  reviewNotesInput: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 80,
    maxHeight: 120,
    marginBottom: theme.spacing.xxl,
    lineHeight: 20,
  },
  reviewConfirmBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.xl,
    paddingVertical: 14,
    alignItems: "center",
    ...theme.shadow.md,
  },
  reviewConfirmBtnText: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.primaryForeground,
  },
  switchToCircuitBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.xl,
    paddingVertical: 12,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  switchToCircuitBtnText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.medium,
  },
});
