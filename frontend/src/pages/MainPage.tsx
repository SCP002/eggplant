import ChatBox from "@/components/ChatBox"
import { NotificationBell } from "@/components/NotificationBell"
import RoomMembersBox from "@/components/RoomMembersBox"
import RoomsBox from "@/components/RoomsBox"
import SettingsDialog from "@/components/SettingsDialog"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import UserMenu from "@/components/UserMenu"
import { useMainPageStore } from "@/context/mainPageStore"
import {
  notification,
  serverNotificationToItem,
  useNotificationHistoryStore,
} from "@/context/notificationHistoryStore"
import { useRoomsStore } from "@/context/roomsStore"
import { useAuthStore } from "@/hooks/useAuthStore"
import { apiErrorMessage } from "@/lib/apiErrorMessage"
import { backClosableStore } from "@/lib/backClosable"
import { getLastActiveRoomId, setLastActiveRoomId } from "@/lib/lastActiveRoom"
import { markdownToPlainText } from "@/lib/markdownToPlainText"
import {
  ensureAudioUnlocked,
  getNotificationAudio,
  isFocused,
  isInTray,
  notifyIncomingCall,
  notifyNewMessage,
  playRingTone,
  stopRingTone,
  syncAppBadge,
  triggerSystemNotification,
} from "@/lib/notifications"
import tokenHttpClient from "@/lib/tokenHttpClient"
import { App } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"
import type { NotificationResp, RoomResp, User } from "@eggplant/shared/api"
import type {
  CallStatePayload,
  NewMessageNotificationPayload,
  RoomDeletedPayload,
  RoomInvitationReceivedPayload,
  RoomsListPayload,
  WsResp,
} from "@eggplant/shared/ws"
import { Settings } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Navigate, useNavigate, useParams } from "react-router-dom"
import { useWebSocket } from "react-use-websocket/dist/lib/use-websocket"
import { toast, Toaster } from "sonner"
import { useMediaQuery } from "usehooks-ts"

const MainPage = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { theme } = useTheme()
  const { t } = useTranslation()
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const [settingsOpen, setSettingsOpen] = useState(false)

  const user = useMainPageStore((s) => s.user)
  const setUser = useMainPageStore((s) => s.setUser)
  const updateUser = useMainPageStore((s) => s.updateUser)
  const room = useMainPageStore((s) => s.room)
  const setRoom = useMainPageStore((s) => s.setRoom)
  const userUpdateEvent = useMainPageStore((s) => s.userUpdateEvent)
  const setUserUpdateEvent = useMainPageStore((s) => s.setUserUpdateEvent)
  const disconnectedNoticeShown = useMainPageStore(
    (s) => s.disconnectedNoticeShown,
  )
  const setDisconnectedNoticeShown = useMainPageStore(
    (s) => s.setDisconnectedNoticeShown,
  )
  const mobileView = useMainPageStore((s) => s.mobileView)
  const setMobileView = useMainPageStore((s) => s.setMobileView)
  const setRooms = useRoomsStore((s) => s.setRooms)
  const rooms = useRoomsStore((s) => s.rooms)
  const lastProcessedUpdateRef = useRef<string | null>(null)
  const isClosingWsRef = useRef(false)

  useEffect(() => {
    return () => {
      isClosingWsRef.current = true
      setDisconnectedNoticeShown(false)
    }
  }, [setDisconnectedNoticeShown])

  useEffect(() => {
    ensureAudioUnlocked()
  }, [])

  const navigate = useNavigate()
  const params = useParams()
  const urlRoomId = params.roomId

  const handleRoomSelected = useCallback(
    (r: RoomResp) => {
      setRoom(r)
      setLastActiveRoomId(r.id)
      if (!isDesktop) {
        setMobileView("chat")
      }
    },
    [setRoom, isDesktop, setMobileView],
  )

  const openRoom = useCallback(
    (roomId: number) => {
      const target = rooms.find((r) => r.id === roomId)
      if (!target) return
      handleRoomSelected(target)
      navigate(`/rooms/${target.id}`, { replace: true })
    },
    [rooms, handleRoomSelected, navigate],
  )

  // React to a native notification tap: expose the target room id, consume it
  // and clear it.
  useEffect(() => {
    const consumeNativeRoom = () => {
      const win = window as Window & { nativeNotificationRoomId?: number }
      const roomId = win.nativeNotificationRoomId
      if (roomId === undefined) return
      if (!rooms.some((r) => r.id === roomId)) return
      delete win.nativeNotificationRoomId
      openRoom(roomId)
    }
    consumeNativeRoom()
    window.addEventListener("nativeNotificationRoomId", consumeNativeRoom)
    return () =>
      window.removeEventListener("nativeNotificationRoomId", consumeNativeRoom)
  }, [rooms, openRoom])

  // Electron: a notification click in the tray asks the renderer to navigate
  // to the target room.
  useEffect(() => {
    if (!window.electronAPI?.onNavigateTo) return
    return window.electronAPI.onNavigateTo((target) => {
      if (target.type === "room") {
        openRoom(target.roomId)
        return
      }
      navigate(`/invitation/${target.token}`)
    })
  }, [openRoom, navigate])

  // Navigate back through screens using the Android back button.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || isDesktop) return
    if (mobileView === "rooms") return

    const handler = App.addListener("backButton", () => {
      if (backClosableStore.handleBack()) return
      if (mobileView === "members") {
        setMobileView("chat")
      } else if (mobileView === "chat") {
        setMobileView("rooms")
      }
    })

    return () => {
      void handler.then((h) => h.remove())
    }
  }, [isDesktop, mobileView, setMobileView])

  const fetchProfile = useCallback(async () => {
    try {
      const res = await tokenHttpClient.get<User>("/api/me")
      setUser(res.data)
    } catch (err) {
      notification.error(t("main.loadProfileFailed"), apiErrorMessage(err))
      setUser(null)
    }
  }, [setUser, t])

  useEffect(() => {
    void fetchProfile()
  }, [fetchProfile])

  const token = useAuthStore((s) => s.token)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const wsUpdatesUrl = "/ws/updates"
  const wsProtocols = token ? ["Authorization", token] : undefined

  const mergeNotifications = useNotificationHistoryStore(
    (s) => s.mergeServerNotifications,
  )

  const fetchNotifications = useCallback(async () => {
    try {
      const res =
        await tokenHttpClient.get<NotificationResp[]>("/api/notifications")
      mergeNotifications(res.data.map(serverNotificationToItem))
    } catch (err) {
      console.error("Failed to load notifications", err)
    }
  }, [mergeNotifications])

  useEffect(() => {
    if (!token) return
    void fetchNotifications()
  }, [token, fetchNotifications])

  const { lastMessage: lastWsUpdateMsg } = useWebSocket<WsResp>(wsUpdatesUrl, {
    protocols: wsProtocols,
    onOpen: () => {
      if (!disconnectedNoticeShown) return

      setDisconnectedNoticeShown(false)
      notification.dismiss("ws-disconnected")
      notification.persistent.success(
        "reconnected",
        undefined,
        t("main.reconnectedMessage"),
        "low",
      )
    },
    onClose: (event) => {
      console.error("Updates websocket closed", event)
      if (isClosingWsRef.current) return
      if (event.code === 1008) {
        void refreshToken()
        return
      }
      const wasBackgrounded = isInTray() || !isFocused()
      if (wasBackgrounded) return

      setDisconnectedNoticeShown(true)
      notification.persistent.error(
        "disconnected",
        undefined,
        t("main.disconnectedMessage"),
        "low",
        { id: "ws-disconnected", duration: Infinity },
      )
    },
    onError: (event) => {
      console.error("Updates websocket error", event)
    },
    shouldReconnect: () => true,
    reconnectInterval: 3000,
    retryOnError: true,
  })

  const wsRoomsUrl = "/ws/rooms"

  const { lastMessage: lastWsRoomsMsg } = useWebSocket<WsResp>(wsRoomsUrl, {
    protocols: wsProtocols,
    onClose: (event) => {
      if (event.code === 1008) {
        void refreshToken()
      }
    },
    shouldReconnect: () => true,
    reconnectInterval: 3000,
    retryOnError: true,
  })

  useEffect(() => {
    if (!lastWsUpdateMsg) return
    const msgData = lastWsUpdateMsg.data
    if (lastProcessedUpdateRef.current === msgData) return
    lastProcessedUpdateRef.current = msgData

    try {
      const data = JSON.parse(msgData) as WsResp
      if (data.type === "user_updated") {
        const updatedUser = data.payload as User
        setUserUpdateEvent(updatedUser)
        if (updatedUser.id === user?.id) {
          updateUser(updatedUser)
        }
      }
      if (data.type === "new_message_notification") {
        const payload = data.payload as NewMessageNotificationPayload
        const message = payload.message
        const attachmentCount = message.attachments?.length ?? 0
        const messageText = markdownToPlainText(message.text)
        const attachmentLabel = t("common.attachments", {
          count: attachmentCount,
        })
        const body =
          attachmentCount > 0 && messageText
            ? `${messageText}\n(${attachmentLabel})`
            : attachmentCount > 0
              ? attachmentLabel
              : messageText
        notifyNewMessage({
          roomId: payload.room_id,
          messageId: message.id,
          title: message.sender ?? "Eggplant",
          body,
          isReadingRoom:
            room?.id === payload.room_id &&
            (isDesktop || mobileView === "chat"),
        })
      }
      if (data.type === "room_invitation_received") {
        const inv = data.payload as RoomInvitationReceivedPayload
        const params = {
          username: inv.inviter_username,
          roomName: inv.room_name,
        }
        notification.persistent.success(
          "room_invitation",
          params,
          undefined,
          "normal",
          {
            id: `invite:${inv.id}`,
            actionToken: inv.token,
          },
        )
        getNotificationAudio().play()
        triggerSystemNotification(
          t("main.roomInvitation"),
          t("notifications.types.room_invitation", params),
          { invitationToken: inv.token },
        )
      }
      if (data.type === "room_deleted") {
        const roomDeleted = data.payload as RoomDeletedPayload
        if (room?.id === roomDeleted.room_id) {
          const generalRoom = rooms.find((r) => r.is_general)
          if (generalRoom) {
            handleRoomSelected(generalRoom)
            navigate(`/rooms/${generalRoom.id}`)
          }
        }
      }
      if (data.type === "call_state") {
        const payload = data.payload as CallStatePayload
        if (payload.status === "ringing") {
          // The currently open room drives its own in-call UI via ChatBox.
          if (room?.id === payload.room_id) return
          // A call the current user initiated rings on their own device too.
          if (payload.initiator?.id === user?.id) return
          const targetRoom = rooms.find((r) => r.id === payload.room_id)
          if (!targetRoom) return
          const toastId = `call-ring:${payload.room_id}`
          toast(
            t("call.incomingFrom", {
              username: payload.initiator?.username ?? "",
            }),
            {
              id: toastId,
              duration: 60_000,
              action: {
                label: t("call.answer"),
                onClick: () => openRoom(payload.room_id),
              },
              cancel: {
                label: t("call.dismiss"),
                onClick: () => {
                  toast.dismiss(toastId)
                  stopRingTone()
                },
              },
            },
          )
          notifyIncomingCall(
            payload.room_id,
            targetRoom.name,
            payload.initiator?.username ?? null,
          )
          playRingTone()
        } else {
          toast.dismiss(`call-ring:${payload.room_id}`)
          stopRingTone()
        }
      }
    } catch (err) {
      console.error("Failed to parse updates message", err)
    }
  }, [
    lastWsUpdateMsg,
    user?.id,
    updateUser,
    setUserUpdateEvent,
    room,
    navigate,
    setRoom,
    handleRoomSelected,
    openRoom,
    rooms,
    isDesktop,
    mobileView,
    t,
  ])

  useEffect(() => {
    if (!lastWsRoomsMsg) return
    try {
      const data = JSON.parse(lastWsRoomsMsg.data) as WsResp
      if (data.type !== "rooms_list") return

      const roomsPayload = data.payload as RoomsListPayload
      const roomsList = roomsPayload.rooms
      setRooms(roomsList)
      syncAppBadge(roomsList.reduce((sum, r) => sum + (r.unread_count ?? 0), 0))

      if (!room) {
        // When the app was launched by tapping a native notification, the
        // native side injects the target room id before the WebView loads.
        const win = window as Window & { nativeNotificationRoomId?: number }
        const nativeRoomId = win.nativeNotificationRoomId
        const lastRoomId = getLastActiveRoomId()
        const matched = nativeRoomId
          ? roomsList.find((r) => r.id === nativeRoomId)
          : urlRoomId
            ? roomsList.find((r) => r.id.toString() === urlRoomId)
            : lastRoomId
              ? roomsList.find((r) => r.id === lastRoomId)
              : null
        // Consume the injected room id so the notification-tap effect does
        // not resolve the same room a second time.
        if (nativeRoomId !== undefined && matched) {
          delete win.nativeNotificationRoomId
        }
        const generalRoom = matched ?? roomsList.find((r) => r.is_general)
        if (generalRoom) {
          handleRoomSelected(generalRoom)
          if (!urlRoomId) {
            navigate(`/rooms/${generalRoom.id}`, { replace: true })
          }
        } else {
          notification.error(
            t("main.noGeneralRoom"),
            t("main.noGeneralRoomMessage"),
          )
        }
      }
    } catch (err) {
      console.error("Failed to parse rooms message", err)
    }
  }, [
    lastWsRoomsMsg,
    setRooms,
    urlRoomId,
    navigate,
    setRoom,
    handleRoomSelected,
    room,
    t,
  ])

  useEffect(() => {
    if (!room) return
    if (room.id.toString() !== urlRoomId) {
      navigate(`/rooms/${room.id}`, { replace: true })
    }
  }, [room, urlRoomId, navigate])

  if (!isAuthenticated) return <Navigate to="/login" replace />

  const showRooms = isDesktop || mobileView === "rooms"
  const showChat = isDesktop || mobileView === "chat"
  const showMembers = isDesktop || mobileView === "members"

  return (
    <div className="flex flex-col h-dvh md:h-screen">
      <div className="p-4 flex justify-between items-center">
        <div>{/* Existing UI components */}</div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            title={t("settings.title")}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="text-primary size-4" />
          </Button>

          <NotificationBell />

          <UserMenu size={"lg"} user={user} />
        </div>
      </div>

      <div className="flex px-4 pt-0 pb-4 gap-4 flex-1 overflow-hidden">
        {showRooms && (
          <div className={`h-full ${isDesktop ? "flex-1" : "w-full"}`}>
            <RoomsBox currentRoom={room} onRoomSelect={handleRoomSelected} />
          </div>
        )}

        {showChat && (
          <div className={`h-full ${isDesktop ? "flex-5" : "w-full"}`}>
            <ChatBox
              room={room}
              userUpdated={userUpdateEvent}
              onBack={() => setMobileView("rooms")}
              onShowMembers={() => setMobileView("members")}
            />
          </div>
        )}

        {showMembers && (
          <div className={`h-full ${isDesktop ? "flex-1" : "w-full"}`}>
            <RoomMembersBox
              room={room}
              userUpdated={userUpdateEvent}
              onBackToChat={() => setMobileView("chat")}
            />
          </div>
        )}
      </div>

      <Toaster richColors theme={theme} />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

export default MainPage
