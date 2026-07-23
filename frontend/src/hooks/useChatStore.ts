import type { MessageReaction, MessageResp, User } from "@eggplant/shared/api"
import { create } from "zustand"

type ChatState = {
  messages: MessageResp[]
  replyTo: MessageResp | null
  loadingOlderMessages: boolean
  loadingNewerMessages: boolean
  hasOlderMessages: boolean
  hasNewerMessages: boolean
  highlightedMessageId: number | null
  setMessages: (messages: MessageResp[]) => void
  setReplyTo: (message: MessageResp | null) => void
  appendMessage: (message: MessageResp) => void
  prependMessages: (messages: MessageResp[]) => void
  appendMessages: (messages: MessageResp[]) => void
  removeMessagesBySender: (senderId: number) => void
  removeMessage: (messageId: number) => void
  updateMessagesForUser: (user: User) => void
  updateMessage: (message: MessageResp) => void
  updateMessageReactions: (
    messageId: number,
    reactions: MessageReaction[],
  ) => void
  setLoadingOlderMessages: (v: boolean) => void
  setLoadingNewerMessages: (v: boolean) => void
  setHasOlderMessages: (v: boolean) => void
  setHasNewerMessages: (v: boolean) => void
  setHighlightedMessageId: (messageId: number | null) => void
  showScrollToEnd: boolean
  setShowScrollToEnd: (v: boolean) => void
  typingUsers: Map<number, { username: string; expiresAt: number }>
  setTypingUser: (userId: number, username: string, expiresAt: number) => void
  removeTypingUser: (userId: number) => void
  clearTypingUsers: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  replyTo: null,
  loadingOlderMessages: false,
  loadingNewerMessages: false,
  hasOlderMessages: true,
  hasNewerMessages: false,
  highlightedMessageId: null,
  showScrollToEnd: false,
  setShowScrollToEnd: (v: boolean) => set({ showScrollToEnd: v }),
  typingUsers: new Map<number, { username: string; expiresAt: number }>(),
  setTypingUser: (userId: number, username: string, expiresAt: number) =>
    set((state) => {
      const typingUsers = new Map(state.typingUsers)
      typingUsers.set(userId, { username, expiresAt })
      return { typingUsers }
    }),
  removeTypingUser: (userId: number) =>
    set((state) => {
      if (!state.typingUsers.has(userId)) return state
      const typingUsers = new Map(state.typingUsers)
      typingUsers.delete(userId)
      return { typingUsers }
    }),
  clearTypingUsers: () => set({ typingUsers: new Map() }),
  updateMessagesForUser: (user: User) => {
    const applyUserToMessage = (message: MessageResp) => {
      if (message.sender_id === null) return message
      const next = { ...message }
      if (message.sender_id === user.id) {
        next.sender = user.username
        next.avatar_url = user.avatar_url
      }

      if (message.parent?.sender_id === user.id) {
        next.parent = {
          ...message.parent,
          sender: user.username,
          avatar_url: user.avatar_url,
        }
      }

      if (next.reactions?.some((r) => r.users.some((u) => u.id === user.id))) {
        next.reactions = next.reactions.map((r) => ({
          ...r,
          users: r.users.map((u) =>
            u.id === user.id
              ? { ...u, username: user.username, avatar_url: user.avatar_url }
              : u,
          ),
        }))
      }

      return next
    }

    set((state) => ({
      messages: state.messages.map((message) => applyUserToMessage(message)),
    }))
  },
  setMessages: (messages: MessageResp[]) => set({ messages }),
  setReplyTo: (message: MessageResp | null) => set({ replyTo: message }),
  appendMessage: (message: MessageResp) =>
    set((state) => ({ messages: [...state.messages, message] })),
  prependMessages: (messages: MessageResp[]) =>
    set((state) => ({ messages: [...messages, ...state.messages] })),
  appendMessages: (messages: MessageResp[]) =>
    set((state) => ({ messages: [...state.messages, ...messages] })),
  removeMessagesBySender: (senderId: number) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.sender_id !== senderId),
    })),
  removeMessage: (messageId: number) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    })),
  updateMessage: (message: MessageResp) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === message.id ? message : m)),
    })),
  updateMessageReactions: (messageId: number, reactions: MessageReaction[]) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, reactions } : m,
      ),
    })),
  setLoadingOlderMessages: (v: boolean) => set({ loadingOlderMessages: v }),
  setLoadingNewerMessages: (v: boolean) => set({ loadingNewerMessages: v }),
  setHasOlderMessages: (v: boolean) => set({ hasOlderMessages: v }),
  setHasNewerMessages: (v: boolean) => set({ hasNewerMessages: v }),
  setHighlightedMessageId: (messageId: number | null) =>
    set({ highlightedMessageId: messageId }),
}))

export default useChatStore
