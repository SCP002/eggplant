import ChatEditor, { type ChatEditorHandle } from "@/components/ChatEditor"
import ChatMessage from "@/components/ChatMessage"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useCallStore } from "@/context/callStore"
import { useMainPageStore } from "@/context/mainPageStore"
import { notification } from "@/context/notificationHistoryStore"
import { useAuthStore } from "@/hooks/useAuthStore"
import { useChatStore } from "@/hooks/useChatStore"
import i18n from "@/i18n"
import { apiErrorMessage } from "@/lib/apiErrorMessage"
import { setNativeCallActive } from "@/lib/callNative"
import {
  connectToCall,
  leaveLiveKit,
  requestMicPermission,
  setMicMuted,
} from "@/lib/livekit"
import { playRingTone, stopRingTone } from "@/lib/notifications"
import { roomDisplayName } from "@/lib/roomName"
import tokenHttpClient from "@/lib/tokenHttpClient"
import type { MessageResp, RoomResp, User } from "@eggplant/shared/api"
import type {
  CallStateResp,
  MessageByIdDeletedPayload,
  MessagesByUserIdDeletedPayload,
  ReactionsUpdatedPayload,
  TypingPayload,
  WsErrorPayload,
  WsReq,
  WsResp,
} from "@eggplant/shared/ws"
import { useTimeout } from "@mantine/hooks"
import {
  ArrowDown,
  ArrowLeft,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Users,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import { useWebSocket } from "react-use-websocket/dist/lib/use-websocket"
import { useInterval } from "usehooks-ts"

function formatTypingUsers(usernames: string[]): string {
  if (usernames.length === 1)
    return i18n.t("chat.typingSingle", { username: usernames[0] })
  if (usernames.length === 2)
    return i18n.t("chat.typingDouble", {
      first: usernames[0],
      second: usernames[1],
    })
  const others = usernames.length - 2
  return i18n.t(
    others === 1 ? "chat.typingMultipleOne" : "chat.typingMultipleOther",
    {
      first: usernames[0],
      second: usernames[1],
      count: others,
    },
  )
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

const ChatBox = ({
  room,
  userUpdated,
  onBack,
  onShowMembers,
}: {
  room: RoomResp | null
  userUpdated: User | null
  onBack?: () => void
  onShowMembers?: () => void
}) => {
  const messages = useChatStore((s) => s.messages)
  const setMessages = useChatStore((s) => s.setMessages)
  const appendMessage = useChatStore((s) => s.appendMessage)
  const prependMessages = useChatStore((s) => s.prependMessages)
  const removeMessagesBySender = useChatStore((s) => s.removeMessagesBySender)
  const removeMessage = useChatStore((s) => s.removeMessage)
  const updateMessagesForUser = useChatStore((s) => s.updateMessagesForUser)
  const updateMessage = useChatStore((s) => s.updateMessage)
  const updateMessageReactions = useChatStore((s) => s.updateMessageReactions)
  const loadingOlderMessages = useChatStore((s) => s.loadingOlderMessages)
  const hasOlderMessages = useChatStore((s) => s.hasOlderMessages)
  const setLoadingOlderMessages = useChatStore((s) => s.setLoadingOlderMessages)
  const setHasOlderMessages = useChatStore((s) => s.setHasOlderMessages)
  const hasNewerMessages = useChatStore((s) => s.hasNewerMessages)
  const setHasNewerMessages = useChatStore((s) => s.setHasNewerMessages)
  const loadingNewerMessages = useChatStore((s) => s.loadingNewerMessages)
  const setLoadingNewerMessages = useChatStore((s) => s.setLoadingNewerMessages)
  const appendMessages = useChatStore((s) => s.appendMessages)
  const replyTo = useChatStore((s) => s.replyTo)
  const setReplyTo = useChatStore((s) => s.setReplyTo)
  const highlightedMessageId = useChatStore((s) => s.highlightedMessageId)
  const setHighlightedMessageId = useChatStore((s) => s.setHighlightedMessageId)
  const showScrollToEnd = useChatStore((s) => s.showScrollToEnd)
  const setShowScrollToEnd = useChatStore((s) => s.setShowScrollToEnd)
  const typingUsers = useChatStore((s) => s.typingUsers)
  const setTypingUser = useChatStore((s) => s.setTypingUser)
  const removeTypingUser = useChatStore((s) => s.removeTypingUser)
  const clearTypingUsers = useChatStore((s) => s.clearTypingUsers)
  const currentUser = useMainPageStore((s) => s.user)
  const call = useCallStore((s) => s.call)
  const joined = useCallStore((s) => s.joined)
  const muted = useCallStore((s) => s.muted)
  const participantCount = useCallStore((s) => s.participantCount)
  const ringDismissed = useCallStore((s) => s.ringDismissed)
  const setCall = useCallStore((s) => s.setCall)
  const clearCall = useCallStore((s) => s.clearCall)
  const setJoined = useCallStore((s) => s.setJoined)
  const setMuted = useCallStore((s) => s.setMuted)
  const setRingDismissed = useCallStore((s) => s.setRingDismissed)
  const setLivekitRoom = useCallStore((s) => s.setLivekitRoom)
  const resetCallStore = useCallStore((s) => s.reset)
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const isPrependingMessagesRef = useRef(false)
  const initialMessagesLoadedRef = useRef(false)
  const lastJumpedMessageIdRef = useRef<number | null>(null)
  const messageRefs = useRef(new Map<number, HTMLDivElement>())
  const callConnectingRef = useRef(false)
  const joinedAtRef = useRef<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()

  const markJoined = useCallback(() => {
    setJoined(true)
    if (joinedAtRef.current === null) joinedAtRef.current = Date.now()
  }, [setJoined])

  const markLeft = useCallback(() => {
    setJoined(false)
    joinedAtRef.current = null
  }, [setJoined])
  const { start: startHighlightTimeout, clear: clearHighlightTimeout } =
    useTimeout(() => {
      setHighlightedMessageId(null)
    }, 3000)
  const editorRef = useRef<ChatEditorHandle>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)

  const MESSAGE_PAGE_LIMIT = 10
  const TYPING_SEND_INTERVAL_MS = 3_000
  const TYPING_VISIBLE_MS = 5_000

  const lastTypingSentAtRef = useRef(0)

  const token = useAuthStore((s) => s.token)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const wsChatUrl = room?.id ? `/ws/chat/${room.id}` : null
  const wsChatProtocols = token ? ["Authorization", token] : undefined

  const { lastMessage: lastWsChatMsg, sendJsonMessage: sendJsonWsChatMsg } =
    useWebSocket<WsResp>(wsChatUrl, {
      protocols: wsChatProtocols,
      onClose: (event) => {
        if (event.code === 1008) {
          void refreshToken()
        }
      },
      onError: (event) => {
        console.error("Chat websocket error", event)
      },
      shouldReconnect: () => true,
      reconnectInterval: 3000,
      retryOnError: true,
    })

  // Hide typing indicators once their expiry passes.
  useInterval(() => {
    const now = Date.now()
    for (const [userId, { expiresAt }] of typingUsers) {
      if (expiresAt <= now) removeTypingUser(userId)
    }
  }, 1_000)

  // Clear typing indicators when the room changes.
  useEffect(() => {
    clearTypingUsers()
  }, [room?.id, clearTypingUsers])

  /* ---------------- Initial messages ---------------- */

  useEffect(() => {
    if (!room?.id) return

    const loadInitialMessages = async () => {
      try {
        const hasUnread =
          (room.unread_count ?? 0) > 0 && room.last_read_message_id != null

        const fetchMessages = (params: Record<string, number>) =>
          tokenHttpClient
            .get<MessageResp[]>(`/api/rooms/${room.id}/messages`, { params })
            .then((r) => r.data)

        const params: Record<string, number> = { limit: MESSAGE_PAGE_LIMIT }
        if (hasUnread) {
          params.after_id = room.last_read_message_id!
        }

        const unread = await fetchMessages(params)
        let context: MessageResp[] = []
        if (hasUnread && unread.length > 0) {
          context = await fetchMessages({
            before_id: unread[0].id,
            limit: MESSAGE_PAGE_LIMIT,
          })
        }

        const messages = [...context, ...unread]

        setMessages(messages)
        setHasOlderMessages(
          hasUnread
            ? context.length >= MESSAGE_PAGE_LIMIT
            : messages.length >= MESSAGE_PAGE_LIMIT,
        )
        setHasNewerMessages(hasUnread)
        initialMessagesLoadedRef.current = true

        requestAnimationFrame(() => {
          if (hasUnread && unread.length > 0) {
            const firstEl = messageRefs.current.get(unread[0].id)
            if (firstEl) {
              firstEl.scrollIntoView({ block: "start" })
              return
            }
          }
          const el = scrollRef.current
          if (el) el.scrollTop = el.scrollHeight
        })
      } catch (err) {
        notification.error(t("chat.loadMessagesFailed"), apiErrorMessage(err))
      }
    }

    loadInitialMessages()

    return () => {
      initialMessagesLoadedRef.current = false
    }
  }, [
    room?.id,
    room?.last_read_message_id,
    room?.unread_count,
    setMessages,
    setHasOlderMessages,
    setHasNewerMessages,
    t,
  ])

  /* ---------------- WebSocket updates ---------------- */

  useEffect(() => {
    if (!lastWsChatMsg) return

    try {
      const data = JSON.parse(lastWsChatMsg.data) as WsResp

      if (data.type === "new_message") {
        const message = data.payload as MessageResp
        if (message.sender_id !== null) removeTypingUser(message.sender_id)
        if (!hasNewerMessages) {
          appendMessage(message)
        } else {
          setShowScrollToEnd(true)
        }
      }

      if (data.type === "typing") {
        const payload = data.payload as TypingPayload
        if (payload.user_id === currentUser?.id) return
        setTypingUser(
          payload.user_id,
          payload.username,
          Date.now() + TYPING_VISIBLE_MS,
        )
      }

      if (data.type === "messages_by_user_id_deleted") {
        const payload = data.payload as MessagesByUserIdDeletedPayload
        removeMessagesBySender(payload.sender_id)
      }

      if (data.type === "message_updated") {
        const message = data.payload as MessageResp
        updateMessage(message)
      }

      if (data.type === "message_by_id_deleted") {
        const payload = data.payload as MessageByIdDeletedPayload
        removeMessage(payload.message_id)
      }

      if (data.type === "reactions_updated") {
        const payload = data.payload as ReactionsUpdatedPayload
        updateMessageReactions(payload.message_id, payload.reactions)
      }

      if (data.type === "call_state") {
        const callData = data as CallStateResp
        const payload = callData.payload
        if (payload.status === "ended") {
          if (useCallStore.getState().joined) {
            notification.info(i18n.t("call.ended"))
          }
          leaveLiveKit(useCallStore.getState().livekitRoom)
          setLivekitRoom(null)
          clearCall()
          joinedAtRef.current = null
          stopRingTone()
          return
        }
        setCall(callData)
        const isParticipant = payload.participants.some(
          (p) => p.id === currentUser?.id,
        )
        if (isParticipant) {
          markJoined()
        } else {
          markLeft()
        }
        // Ring while the ringing banner is shown; stop once the call moves on.
        if (payload.status === "ringing") {
          if (useCallStore.getState().ringDismissed) {
            stopRingTone()
          } else {
            playRingTone()
          }
        } else {
          stopRingTone()
        }
      }

      if (data.type === "error") {
        const payload = data.payload as WsErrorPayload
        notification.error(
          i18n.t(`errors.${payload.code}` as never, {
            defaultValue: i18n.t("errors.generic"),
          }),
        )
      }
    } catch (err) {
      console.error("Failed to parse chat message", err)
    }
  }, [
    lastWsChatMsg,
    appendMessage,
    removeMessagesBySender,
    removeMessage,
    setShowScrollToEnd,
    updateMessage,
    updateMessageReactions,
    removeTypingUser,
    setTypingUser,
    currentUser?.id,
    hasNewerMessages,
    setCall,
    clearCall,
    markJoined,
    markLeft,
    setLivekitRoom,
  ])

  /* ---------------- User updates ---------------- */

  useEffect(() => {
    if (!userUpdated) return

    updateMessagesForUser(userUpdated)
  }, [userUpdated, updateMessagesForUser])

  /* ---------------- Voice calls ---------------- */

  // Keep the call duration clock ticking while the user is joined.
  useInterval(() => {
    const start = joinedAtRef.current
    setElapsedSeconds(
      start === null ? 0 : Math.floor((Date.now() - start) / 1000),
    )
  }, 1_000)

  // Auto-connect as soon as the current user becomes a call participant.
  useEffect(() => {
    if (!room?.id) return
    if (!call) return
    if (useCallStore.getState().livekitRoom) return
    if (callConnectingRef.current) return
    const isParticipant = call.payload.participants.some(
      (p) => p.id === currentUser?.id,
    )
    if (!isParticipant) return

    callConnectingRef.current = true
    const connect = async () => {
      try {
        await requestMicPermission().catch(() => {
          // No microphone or permission denied: still join to listen.
        })
        const res = await tokenHttpClient.get<{ url: string; token: string }>(
          `/api/rooms/${room.id}/call/token`,
        )
        const lkRoom = await connectToCall({
          url: res.data.url,
          token: res.data.token,
          onDisconnected: () => {
            setLivekitRoom(null)
            markLeft()
          },
        })
        setLivekitRoom(lkRoom)
        markJoined()
      } catch (err) {
        notification.error(t("call.connectFailed"), apiErrorMessage(err))
      } finally {
        callConnectingRef.current = false
      }
    }
    void connect()
  }, [call, room?.id, currentUser?.id, markJoined, markLeft, setLivekitRoom, t])

  // Disconnect LiveKit when the call disappears.
  useEffect(() => {
    if (call) return
    const lk = useCallStore.getState().livekitRoom
    if (!lk) return
    leaveLiveKit(lk)
    setLivekitRoom(null)
  }, [call, setLivekitRoom])

  // Keep the native call foreground service running while joined.
  useEffect(() => {
    if (!joined) return
    void setNativeCallActive(true)
    return () => {
      void setNativeCallActive(false)
    }
  }, [joined])

  // Reset call state when the room changes.
  useEffect(() => {
    const lk = useCallStore.getState().livekitRoom
    if (lk) leaveLiveKit(lk)
    resetCallStore()
    joinedAtRef.current = null
    stopRingTone()
  }, [room?.id, resetCallStore])

  const startCall = () => {
    if (!sendJsonWsChatMsg) return
    try {
      sendJsonWsChatMsg({ type: "call_start", payload: {} })
    } catch (err) {
      notification.error(t("call.startFailed"), apiErrorMessage(err))
    }
  }

  const joinCallFlow = async () => {
    if (!room?.id || !sendJsonWsChatMsg || callConnectingRef.current) return
    callConnectingRef.current = true
    try {
      await requestMicPermission().catch(() => {
        // No microphone or permission denied: still join to listen.
      })
      const res = await tokenHttpClient.get<{ url: string; token: string }>(
        `/api/rooms/${room.id}/call/token`,
      )
      const lkRoom = await connectToCall({
        url: res.data.url,
        token: res.data.token,
        onDisconnected: () => {
          setLivekitRoom(null)
          markLeft()
        },
      })
      setLivekitRoom(lkRoom)
      markJoined()
      sendJsonWsChatMsg({ type: "call_join", payload: {} })
    } catch (err) {
      notification.error(t("call.connectFailed"), apiErrorMessage(err))
    } finally {
      callConnectingRef.current = false
    }
  }

  const leaveCall = () => {
    if (!sendJsonWsChatMsg) return
    try {
      sendJsonWsChatMsg({ type: "call_leave", payload: {} })
    } catch (err) {
      notification.error(t("call.leaveFailed"), apiErrorMessage(err))
    }
    leaveLiveKit(useCallStore.getState().livekitRoom)
    setLivekitRoom(null)
    markLeft()
    setMuted(false)
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    void setMicMuted(useCallStore.getState().livekitRoom, next).catch(() => {
      setMuted(!next)
    })
  }

  const dismissRing = () => {
    setRingDismissed(true)
    stopRingTone()
  }

  /* ---------------- Auto scroll ---------------- */

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    if (isPrependingMessagesRef.current) {
      requestAnimationFrame(() => {
        isPrependingMessagesRef.current = false
      })
      return
    }

    if (!initialMessagesLoadedRef.current) return

    if (!hasNewerMessages && !showScrollToEnd) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, hasNewerMessages, showScrollToEnd])

  // Keep scrolled to bottom as media (images, videos, embeds) loads
  // and the DOM height grows asynchronously.
  const hasNewerMessagesRef = useRef(hasNewerMessages)
  const showScrollToEndRef = useRef(showScrollToEnd)

  useEffect(() => {
    hasNewerMessagesRef.current = hasNewerMessages
  }, [hasNewerMessages])

  useEffect(() => {
    showScrollToEndRef.current = showScrollToEnd
  }, [showScrollToEnd])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleMediaLoad = (e: Event) => {
      const target = e.target as HTMLElement
      if (
        target instanceof HTMLImageElement ||
        target instanceof HTMLVideoElement ||
        target instanceof HTMLIFrameElement
      ) {
        if (!hasNewerMessagesRef.current && !showScrollToEndRef.current) {
          // Use requestAnimationFrame to let the browser complete layout
          // after the media element's dimensions are known.
          requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight
          })
        }
      }
    }

    el.addEventListener("load", handleMediaLoad, true)
    return () => el.removeEventListener("load", handleMediaLoad, true)
  }, [room?.id])

  /* ---------------- Pagination ---------------- */

  const fetchOlderMessages = async () => {
    if (!room?.id || messages.length === 0) return

    const firstMessage = messages[0]
    const el = scrollRef.current

    const prevScrollHeight = el?.scrollHeight ?? 0
    const prevScrollTop = el?.scrollTop ?? 0

    setLoadingOlderMessages(true)

    try {
      const resp = await tokenHttpClient.get<MessageResp[]>(
        `/api/rooms/${room.id}/messages`,
        {
          params: {
            before_id: firstMessage.id,
            limit: MESSAGE_PAGE_LIMIT,
          },
        },
      )

      if (resp.data.length === 0) {
        setHasOlderMessages(false)
        setLoadingOlderMessages(false)
        return
      }

      isPrependingMessagesRef.current = true
      prependMessages(resp.data)

      requestAnimationFrame(() => {
        const newScrollHeight = el?.scrollHeight ?? 0
        if (el) {
          el.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop
        }
        if (resp.data.length < MESSAGE_PAGE_LIMIT) {
          setHasOlderMessages(false)
        }
        setLoadingOlderMessages(false)
      })
    } catch (err) {
      notification.error(t("chat.loadOlderFailed"), apiErrorMessage(err))
      setLoadingOlderMessages(false)
    }
  }

  const fetchNewerMessages = async () => {
    if (!room?.id || messages.length === 0) return

    const lastMessage = messages[messages.length - 1]

    setLoadingNewerMessages(true)

    try {
      const resp = await tokenHttpClient.get<MessageResp[]>(
        `/api/rooms/${room.id}/messages`,
        {
          params: {
            after_id: lastMessage.id,
            limit: MESSAGE_PAGE_LIMIT,
          },
        },
      )

      if (resp.data.length === 0) {
        setHasNewerMessages(false)
        setLoadingNewerMessages(false)
        return
      }

      appendMessages(resp.data)

      requestAnimationFrame(() => {
        if (resp.data.length < MESSAGE_PAGE_LIMIT) {
          setHasNewerMessages(false)
        }
        setLoadingNewerMessages(false)
      })
    } catch (err) {
      notification.error(t("chat.loadNewerFailed"), apiErrorMessage(err))
      setLoadingNewerMessages(false)
    }
  }

  const onScroll = () => {
    const el = scrollRef.current
    if (!el || messages.length === 0) return

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 150
    setShowScrollToEnd(hasNewerMessages || !isNearBottom)

    if (!loadingOlderMessages && hasOlderMessages && el.scrollTop <= 150) {
      fetchOlderMessages()
    }

    if (!loadingNewerMessages && hasNewerMessages && isNearBottom) {
      fetchNewerMessages()
    }
  }

  /* ---------------- Message focus ---------------- */

  const loadAroundMessage = async (messageId: number) => {
    if (!room?.id) return

    try {
      const resp = await tokenHttpClient.get<MessageResp[]>(
        `/api/rooms/${room.id}/messages`,
        {
          params: {
            around_id: messageId,
            limit: MESSAGE_PAGE_LIMIT,
          },
        },
      )

      if (resp.data.length > 0) {
        setMessages(resp.data)
        setHasOlderMessages(true)
        setHasNewerMessages(true)

        setTimeout(() => {
          const el = messageRefs.current.get(messageId)
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        }, 100)
      }
    } catch (err) {
      notification.error(t("chat.loadRepliedFailed"), apiErrorMessage(err))
    }
  }

  const jumpToMessage = async (messageId: number) => {
    setHighlightedMessageId(messageId)
    lastJumpedMessageIdRef.current = messageId
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set("messageId", messageId.toString())
    setSearchParams(nextParams, { replace: true })
    clearHighlightTimeout()
    startHighlightTimeout()

    const el = messageRefs.current.get(messageId)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }

    await loadAroundMessage(messageId)
  }

  const jumpToBottom = async () => {
    if (!room?.id) return

    const nextParams = new URLSearchParams(searchParams)
    if (nextParams.has("messageId")) {
      nextParams.delete("messageId")
      setSearchParams(nextParams, { replace: true })
    }

    if (!hasNewerMessages) {
      const el = scrollRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
      setShowScrollToEnd(false)
      return
    }

    try {
      const resp = await tokenHttpClient.get<MessageResp[]>(
        `/api/rooms/${room.id}/messages`,
        { params: { limit: MESSAGE_PAGE_LIMIT } },
      )

      setMessages(resp.data)
      setHasOlderMessages(resp.data.length >= MESSAGE_PAGE_LIMIT)
      setHasNewerMessages(false)
      setShowScrollToEnd(false)

      setTimeout(() => {
        const el = scrollRef.current
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: "auto" })
      }, 50)
    } catch (err) {
      notification.error(t("chat.loadMessagesFailed"), apiErrorMessage(err))
    }
  }

  useEffect(() => {
    if (!initialMessagesLoadedRef.current) return
    const messageIdParam = searchParams.get("messageId")
    if (!messageIdParam) return

    const messageId = Number(messageIdParam)
    if (lastJumpedMessageIdRef.current !== messageId) {
      lastJumpedMessageIdRef.current = messageId
      void jumpToMessage(messageId)
    }
  }, [messages, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- Edit message ---------------- */

  const editMessage = (
    messageId: number,
    text: string,
    fileIds?: string[],
    removeFileIds?: string[],
  ) => {
    if (!sendJsonWsChatMsg) return

    try {
      const wsMessage: WsReq = {
        type: "edit_message",
        payload: {
          message_id: messageId,
          text,
          file_ids: fileIds,
          remove_file_ids: removeFileIds,
        },
      }
      sendJsonWsChatMsg(wsMessage)
    } catch (err) {
      notification.error(t("chat.editFailed"), apiErrorMessage(err))
    }
  }

  const deleteMessage = (messageId: number) => {
    if (!sendJsonWsChatMsg) return

    try {
      const wsMessage: WsReq = {
        type: "delete_message",
        payload: { message_id: messageId },
      }
      sendJsonWsChatMsg(wsMessage)
    } catch (err) {
      notification.error(t("chat.deleteFailed"), apiErrorMessage(err))
    }
  }

  const toggleReaction = (messageId: number, emoji: string) => {
    if (!sendJsonWsChatMsg) return

    try {
      const wsMessage: WsReq = {
        type: "react",
        payload: { message_id: messageId, emoji },
      }
      sendJsonWsChatMsg(wsMessage)
    } catch (err) {
      notification.error(t("chat.reactFailed"), apiErrorMessage(err))
    }
  }

  /* ---------------- Send message ---------------- */

  const sendMessage = (text: string, fileIds: string[]) => {
    if (!sendJsonWsChatMsg) return

    try {
      const wsMessage: WsReq = {
        type: "message",
        payload: {
          text,
          parent_id: replyTo?.id ?? null,
          file_ids: fileIds,
        },
      }
      sendJsonWsChatMsg(wsMessage)
      setReplyTo(null)
      if (hasNewerMessages || showScrollToEnd) {
        jumpToBottom()
      }
    } catch (err) {
      notification.error(t("chat.sendFailed"), apiErrorMessage(err))
    }
  }

  const notifyTyping = useCallback(() => {
    const now = Date.now()
    if (now - lastTypingSentAtRef.current < TYPING_SEND_INTERVAL_MS) return
    lastTypingSentAtRef.current = now
    if (!sendJsonWsChatMsg) return
    try {
      const wsMessage: WsReq = { type: "typing", payload: {} }
      sendJsonWsChatMsg(wsMessage)
    } catch (err) {
      console.error("Failed to send typing event", err)
    }
  }, [sendJsonWsChatMsg])

  /* ---------------- Drag-and-drop ---------------- */

  const handleDragEnter = (e: DragEvent) => {
    if (e.dataTransfer.types?.includes("Files")) {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current++
      if (dragCounter.current === 1) {
        setIsDragOver(true)
      }
    }
  }

  const handleDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types?.includes("Files")) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const handleDragLeave = (e: DragEvent) => {
    if (e.dataTransfer.types?.includes("Files")) {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current--
      if (dragCounter.current <= 0) {
        dragCounter.current = 0
        setIsDragOver(false)
      }
    }
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDragOver(false)

    if (e.dataTransfer.files.length > 0) {
      editorRef.current?.attachFiles(e.dataTransfer.files)
    }
  }

  /* ---------------- Render ---------------- */

  if (!room) {
    return (
      <div className="h-full flex items-center justify-center border rounded-md">
        <div>{t("chat.loadingRoom")}</div>
      </div>
    )
  }

  return (
    <div
      className="relative flex flex-col h-full border rounded-md overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="px-4 h-16 border-b flex items-center gap-2">
        {onBack && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            className="shrink-0 md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="font-medium flex-1 truncate">
          {roomDisplayName(room, t)}
        </div>
        {!room.is_general && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={startCall}
            title={t("call.start")}
            className="shrink-0"
          >
            <Phone className="h-4 w-4" />
          </Button>
        )}
        {onShowMembers && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onShowMembers}
            className="shrink-0 md:hidden"
          >
            <Users className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Call panel */}
      {call && (
        <div className="border-b px-4 py-3 bg-muted/30 flex flex-wrap items-center gap-3">
          {call.payload.status === "ringing" &&
            !ringDismissed &&
            (call.payload.initiator?.id === currentUser?.id ? (
              <>
                <PhoneCall className="h-4 w-4 animate-pulse text-primary shrink-0" />
                <span className="text-sm font-medium flex-1">
                  {t("call.ringing")}
                </span>
                <Button variant="destructive" size="sm" onClick={leaveCall}>
                  <PhoneOff className="h-4 w-4 mr-1" />
                  {t("call.end")}
                </Button>
              </>
            ) : (
              <>
                <PhoneIncoming className="h-4 w-4 animate-pulse text-primary shrink-0" />
                <span className="text-sm font-medium flex-1">
                  {t("call.incomingFrom", {
                    username: call.payload.initiator?.username ?? "",
                  })}
                </span>
                <Button variant="ghost" size="sm" onClick={dismissRing}>
                  {t("call.dismiss")}
                </Button>
                <Button variant="default" size="sm" onClick={joinCallFlow}>
                  {t("call.answer")}
                </Button>
              </>
            ))}

          {call.payload.status === "active" && joined && (
            <>
              <PhoneCall className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium tabular-nums">
                {formatDuration(elapsedSeconds)}
              </span>
              <span className="text-sm text-muted-foreground">
                {t("call.participants", { count: participantCount })}
              </span>
              <Button variant="outline" size="sm" onClick={toggleMute}>
                {muted ? (
                  <MicOff className="h-4 w-4 mr-1" />
                ) : (
                  <Mic className="h-4 w-4 mr-1" />
                )}
                {muted ? t("call.unmute") : t("call.mute")}
              </Button>
              <Button variant="destructive" size="sm" onClick={leaveCall}>
                <PhoneOff className="h-4 w-4 mr-1" />
                {t("call.leave")}
              </Button>
            </>
          )}

          {call.payload.status === "active" && !joined && (
            <>
              <PhoneCall className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium flex-1">
                {t("call.inProgress")}
              </span>
              <Button variant="default" size="sm" onClick={joinCallFlow}>
                {t("call.join")}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Messages */}
      <ScrollArea
        className="flex-1 min-h-0"
        viewportRef={scrollRef}
        onScroll={onScroll}
      >
        <div className="p-4">
          <div className="flex flex-col gap-3 [overflow-anchor:none]">
            {messages.length === 0 && (
              <div className="text-muted-foreground">
                {t("chat.noMessages")}
              </div>
            )}

            {loadingOlderMessages && (
              <div className="text-muted-foreground text-center">
                {t("chat.loadingOlder")}
              </div>
            )}

            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onReply={(m) => {
                  setReplyTo(m)
                  editorRef.current?.focus()
                }}
                onJumpToParent={jumpToMessage}
                onEdit={editMessage}
                onDelete={deleteMessage}
                onToggleReaction={toggleReaction}
                isHighlighted={message.id === highlightedMessageId}
                currentUserId={currentUser?.id ?? null}
                messageRef={(element) => {
                  if (element) {
                    messageRefs.current.set(message.id, element)
                  } else {
                    messageRefs.current.delete(message.id)
                  }
                }}
              />
            ))}

            {loadingNewerMessages && (
              <div className="text-muted-foreground text-center">
                {t("chat.loadingNewer")}
              </div>
            )}
          </div>

          <div aria-hidden="true" className="h-px [overflow-anchor:auto]" />
        </div>
      </ScrollArea>

      {/* Scroll to End Bar */}
      {showScrollToEnd && (
        <div className="z-10 shrink-0 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
          <Button
            variant="ghost"
            className="w-full h-8 rounded-none text-xs flex items-center justify-between px-4 text-muted-foreground hover:text-foreground"
            onClick={jumpToBottom}
          >
            <span>{t("chat.viewingOlder")}</span>
            <span className="flex items-center text-primary font-medium">
              {t("chat.jumpToPresent")}
              <ArrowDown className="ml-1 h-3 w-3" />
            </span>
          </Button>
        </div>
      )}

      {/* Drop zone overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 border-2 border-dashed border-primary rounded-md pointer-events-none">
          <p className="text-lg font-semibold text-primary">
            {t("chat.dropFiles")}
          </p>
        </div>
      )}

      {/* Editor */}
      <div className="p-4 border-t relative">
        {typingUsers.size > 0 && (
          <div className="text-xs text-muted-foreground mb-2">
            {formatTypingUsers(
              Array.from(typingUsers.values(), (v) => v.username),
            )}
          </div>
        )}
        <ChatEditor
          ref={editorRef}
          onSend={sendMessage}
          onTypingChange={(typing) => {
            if (typing) notifyTyping()
          }}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          onJumpToParent={jumpToMessage}
        />
      </div>
    </div>
  )
}

export default ChatBox
