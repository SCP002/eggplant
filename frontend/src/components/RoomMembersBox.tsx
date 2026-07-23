import InviteUserDialog from "@/components/InviteUserDialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import UserInfoCard from "@/components/UserInfoCard"
import { useMainPageStore } from "@/context/mainPageStore"
import { notification } from "@/context/notificationHistoryStore"
import { useRoomMembersStore } from "@/context/roomMembersStore"
import { useAuthStore } from "@/hooks/useAuthStore"
import { apiErrorMessage } from "@/lib/apiErrorMessage"
import tokenHttpClient from "@/lib/tokenHttpClient"
import { cn, getInitials } from "@/lib/utils"
import type { RoomMemberResp, RoomResp, User } from "@eggplant/shared/api"
import type { WsResp } from "@eggplant/shared/ws"
import { ArrowLeft, MoreVertical, UserPlus } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useWebSocket } from "react-use-websocket/dist/lib/use-websocket"

type MenuActionItem = React.ComponentType<{
  onSelect?: () => void
  variant?: "default" | "destructive"
  disabled?: boolean
  className?: string
  children?: React.ReactNode
}>

const MemberMenuItems = ({
  Item,
  Separator,
  messageDisabled,
  showAdminActions,
  canPromote,
  isAdminRole,
  onMessage,
  onChangeRole,
  onRemove,
}: {
  Item: MenuActionItem
  Separator: React.ComponentType<{ className?: string }>
  messageDisabled: boolean
  showAdminActions: boolean
  canPromote: boolean
  isAdminRole: boolean
  onMessage: () => void
  onChangeRole: () => void
  onRemove: () => void
}) => {
  const { t } = useTranslation()

  return (
    <>
      <Item disabled={messageDisabled} onSelect={onMessage}>
        {t("roomMembers.message")}
      </Item>
      {showAdminActions && (
        <>
          <Separator />
          {canPromote && (
            <Item onSelect={onChangeRole}>
              {isAdminRole
                ? t("roomMembers.demoteToMember")
                : t("roomMembers.promoteToAdmin")}
            </Item>
          )}
          <Item className="text-destructive" onSelect={onRemove}>
            {t("roomMembers.remove")}
          </Item>
        </>
      )}
    </>
  )
}

const RoomMembersBox = ({
  room,
  userUpdated,
  onBackToChat,
}: {
  room: RoomResp | null
  userUpdated: User | null
  onBackToChat?: () => void
}) => {
  const members = useRoomMembersStore((s) => s.members)
  const setMembers = useRoomMembersStore((s) => s.setMembers)
  const updateMember = useRoomMembersStore((s) => s.updateMember)

  const navigate = useNavigate()
  const setRoom = useMainPageStore((s) => s.setRoom)
  const me = useMainPageStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const { t } = useTranslation()
  const wsRoomMembersUrl = room?.id ? `/ws/room_members/${room?.id}` : null
  const wsRoomMembersProtocols = token ? ["Authorization", token] : undefined

  const [inviteOpen, setInviteOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<RoomMemberResp | null>(null)

  const { lastMessage: lastRoomMembersMsg } = useWebSocket<WsResp>(
    wsRoomMembersUrl,
    {
      protocols: wsRoomMembersProtocols,
      onClose: (event) => {
        if (event.code === 1008) {
          void refreshToken()
        }
      },
      onError: (event) => {
        console.error("Room members websocket error", event)
      },
      shouldReconnect: () => true,
      reconnectInterval: 3000,
      retryOnError: true,
    },
  )

  useEffect(() => {
    if (!lastRoomMembersMsg) return
    try {
      const data = JSON.parse(lastRoomMembersMsg.data) as WsResp
      if (data.type === "room_members") {
        const payloadMembers = data.payload as RoomMemberResp[]
        setMembers(payloadMembers)
      }
    } catch (err) {
      console.error("Failed to parse room members message", err)
    }
  }, [lastRoomMembersMsg, setMembers])

  useEffect(() => {
    if (!userUpdated) return
    updateMember({
      ...userUpdated,
      username: userUpdated.username,
      avatar_url: userUpdated.avatar_url,
    })
  }, [userUpdated, updateMember])

  const currentMember = members.find((m) => m.id === me?.id)
  const isAdmin =
    currentMember?.role === "owner" || currentMember?.role === "admin"
  const isOwner = currentMember?.role === "owner"

  if (!room) {
    return (
      <div className="h-full flex items-center justify-center border rounded-md">
        <div className="text-sm text-muted-foreground">
          {t("roomMembers.loading")}
        </div>
      </div>
    )
  }

  const onlineCount = members.filter((m) => m.online).length
  const totalCount = members.length

  const sortedMembers = members
    .slice()
    .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0))

  const startDmWithUser = async (userId: number) => {
    try {
      const res = await tokenHttpClient.post<RoomResp>(`/api/dms/${userId}`)
      setRoom(res.data)
      onBackToChat?.()
      navigate(`/rooms/${res.data.id}`)
    } catch (err) {
      notification.error(t("roomMembers.dmFailed"), apiErrorMessage(err))
    }
  }

  const kickMember = async (userId: number) => {
    if (!room) return
    try {
      await tokenHttpClient.delete(`/api/rooms/${room.id}/members/${userId}`)
      setRemoveTarget(null)
    } catch (err) {
      notification.error(t("roomMembers.removeFailed"), apiErrorMessage(err))
    }
  }

  const changeRole = async (userId: number, role: string) => {
    if (!room) return
    try {
      await tokenHttpClient.put(
        `/api/rooms/${room.id}/members/${userId}/role`,
        { role },
      )
    } catch (err) {
      notification.error(
        t("roomMembers.roleChangeFailed"),
        apiErrorMessage(err),
      )
    }
  }

  return (
    <>
      <div className="flex flex-col h-full border rounded-md overflow-hidden">
        <div className="px-4 h-16 border-b flex items-center gap-2">
          {onBackToChat && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onBackToChat}
              className="shrink-0 md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="font-medium flex-1">
            {t("roomMembers.onlineCount", {
              online: onlineCount,
              total: totalCount,
            })}
          </div>
          {isAdmin && !room.is_general && !room.is_dm && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setInviteOpen(true)}
              aria-label={t("roomMembers.inviteUser")}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="p-4 flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-3">
            {sortedMembers.map((m) => (
              <ContextMenu key={m.id}>
                <ContextMenuTrigger asChild>
                  <div
                    className={cn(
                      "p-3 rounded-md shadow-sm transition-colors flex items-center gap-3",
                      "pointer-fine:hover:bg-muted/50 pointer-coarse:active:bg-muted/50",
                    )}
                  >
                    <Avatar
                      size="lg"
                      className={m.online ? "opacity-100" : "opacity-30"}
                    >
                      {m.avatar_url ? (
                        <AvatarImage src={m.avatar_url} />
                      ) : (
                        <AvatarFallback>
                          {getInitials(m.username)}
                        </AvatarFallback>
                      )}
                    </Avatar>

                    <div
                      className={`flex flex-col ${m.online ? "opacity-100" : "opacity-30"}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <UserInfoCard
                          user={{
                            id: m.id,
                            username: m.username,
                            avatar_url: m.avatar_url,
                          }}
                        >
                          <button
                            type="button"
                            className="font-medium text-left cursor-pointer hover:underline underline-offset-2"
                          >
                            {m.username}
                          </button>
                        </UserInfoCard>
                        {m.role === "owner" && (
                          <span className="text-[10px] text-amber-500 font-semibold">
                            {t("roomMembers.owner")}
                          </span>
                        )}
                        {m.role === "admin" && (
                          <span className="text-[10px] text-blue-500 font-semibold">
                            {t("roomMembers.admin")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="ml-auto">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            aria-label={t("roomMembers.openActions", {
                              username: m.username,
                            })}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-40">
                          <MemberMenuItems
                            Item={DropdownMenuItem}
                            Separator={DropdownMenuSeparator}
                            messageDisabled={!me || me.id === m.id}
                            showAdminActions={
                              isAdmin &&
                              me?.id !== m.id &&
                              !room.is_general &&
                              !room.is_dm
                            }
                            canPromote={isOwner && m.role !== "owner"}
                            isAdminRole={m.role === "admin"}
                            onMessage={() => startDmWithUser(m.id)}
                            onChangeRole={() =>
                              changeRole(
                                m.id,
                                m.role === "admin" ? "member" : "admin",
                              )
                            }
                            onRemove={() => setRemoveTarget(m)}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </ContextMenuTrigger>

                <ContextMenuContent className="min-w-40">
                  <MemberMenuItems
                    Item={ContextMenuItem}
                    Separator={ContextMenuSeparator}
                    messageDisabled={!me || me.id === m.id}
                    showAdminActions={
                      isAdmin &&
                      me?.id !== m.id &&
                      !room.is_general &&
                      !room.is_dm
                    }
                    canPromote={isOwner && m.role !== "owner"}
                    isAdminRole={m.role === "admin"}
                    onMessage={() => startDmWithUser(m.id)}
                    onChangeRole={() =>
                      changeRole(m.id, m.role === "admin" ? "member" : "admin")
                    }
                    onRemove={() => setRemoveTarget(m)}
                  />
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        </div>
      </div>
      {room && (
        <InviteUserDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          roomId={room.id}
        />
      )}

      <Dialog
        open={removeTarget !== null}
        onOpenChange={() => setRemoveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("roomMembers.removeTitle")}</DialogTitle>
            <DialogDescription>
              {t("roomMembers.removeConfirm", {
                username: removeTarget?.username,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeTarget && kickMember(removeTarget.id)}
            >
              {t("roomMembers.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default RoomMembersBox
