import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActiveConversationState, Conversation, ConversationSummary, Message } from "../types";

const CONVERSATION_STORAGE_KEY = "conversation_state_v1";

function generateConversationId(): string {
  return `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildConversationTitle(messages: Message[], createdAt: number): string {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const text = firstUserMessage?.content?.trim();

  if (text) {
    return text.length > 20 ? `${text.slice(0, 20)}…` : text;
  }

  if (firstUserMessage?.image) {
    return `图片题目 ${new Date(createdAt).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return "新对话";
}

function buildConversationPreview(messages: Message[]): string {
  const latestMessage = [...messages]
    .reverse()
    .find((message) => Boolean(message.content.trim()) || Boolean(message.image));

  if (!latestMessage) {
    return "暂无消息";
  }

  if (latestMessage.content.trim()) {
    return latestMessage.content.trim().slice(0, 36);
  }

  if (latestMessage.image) {
    return "包含图片题目";
  }

  return "暂无消息";
}

function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

function normalizeConversation(conversation: Conversation): Conversation {
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const createdAt = typeof conversation.createdAt === "number" ? conversation.createdAt : Date.now();
  const updatedAt = typeof conversation.updatedAt === "number" ? conversation.updatedAt : createdAt;

  return {
    id: conversation.id,
    title: buildConversationTitle(messages, createdAt),
    messages,
    createdAt,
    updatedAt,
  };
}

export function createConversation(): Conversation {
  const now = Date.now();
  return {
    id: generateConversationId(),
    title: "新对话",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertConversationMessages(
  conversation: Conversation,
  messages: Message[]
): Conversation {
  const updatedAt = Date.now();
  return {
    ...conversation,
    messages,
    updatedAt,
    title: buildConversationTitle(messages, conversation.createdAt),
  };
}

export function replaceConversation(
  conversations: Conversation[],
  nextConversation: Conversation
): Conversation[] {
  const existing = conversations.some((conversation) => conversation.id === nextConversation.id);
  const nextConversations = existing
    ? conversations.map((conversation) =>
        conversation.id === nextConversation.id ? normalizeConversation(nextConversation) : conversation
      )
    : [...conversations, normalizeConversation(nextConversation)];

  return sortConversations(nextConversations);
}

export function deleteConversation(
  conversations: Conversation[],
  conversationId: string
): { conversations: Conversation[]; newActiveId: string | null } {
  const filtered = conversations.filter((c) => c.id !== conversationId);
  if (filtered.length === 0) {
    const fresh = createConversation();
    return { conversations: [fresh], newActiveId: fresh.id };
  }
  return {
    conversations: sortConversations(filtered),
    newActiveId: filtered[0]?.id || null,
  };
}

export function summarizeConversation(conversation: Conversation): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    preview: buildConversationPreview(conversation.messages),
    messageCount: conversation.messages.length,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export async function loadConversationState(): Promise<ActiveConversationState> {
  const raw = await AsyncStorage.getItem(CONVERSATION_STORAGE_KEY);

  if (!raw) {
    const initialConversation = createConversation();
    return {
      conversations: [initialConversation],
      activeConversationId: initialConversation.id,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ActiveConversationState>;
    const conversations = Array.isArray(parsed.conversations)
      ? sortConversations(parsed.conversations.map(normalizeConversation))
      : [];

    if (conversations.length === 0) {
      const initialConversation = createConversation();
      return {
        conversations: [initialConversation],
        activeConversationId: initialConversation.id,
      };
    }

    const activeConversationId =
      typeof parsed.activeConversationId === "string" &&
      conversations.some((conversation) => conversation.id === parsed.activeConversationId)
        ? parsed.activeConversationId
        : conversations[0].id;

    return {
      conversations,
      activeConversationId,
    };
  } catch {
    const initialConversation = createConversation();
    return {
      conversations: [initialConversation],
      activeConversationId: initialConversation.id,
    };
  }
}

export async function saveConversationState(state: ActiveConversationState): Promise<void> {
  await AsyncStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(state));
}

export async function clearConversationState(): Promise<void> {
  await AsyncStorage.removeItem(CONVERSATION_STORAGE_KEY);
}
