import CreateRoomDialog from "@/components/CreateRoomDialog"
import EditRoomDialog from "@/components/EditRoomDialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
import { useMainPageStore } from "@/context/mainPageStore"
import { notification } from "@/context/notificationHistoryStore"
import { useRoomsStore } from "@/context/roomsStore"
import { apiErrorMessage } from "@/lib/apiErrorMessage"
import { roomDisplayName } from "@/lib/roomName"
import tokenHttpClient from "@/lib/tokenHttpClient"
import { cn, getInitials } from "@/lib/utils"
import type { RoomResp } from "@eggplant/shared/api"
import { MoreVertical, Plus } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

type MenuActionItem = React.ComponentType<{
  onSelect?: () => void
  variant?: "default" | "destructive"
  disabled?: boolean
  className?: string
  children?: React.ReactNode
}>

const RoomMenuItems = ({
  Item,
  Separator,
  canManage,
  isDm,
  onEdit,
  onDelete,
  onLeave,
}: {
  Item: MenuActionItem
  Separator: React.ComponentType<{ className?: string }>
  canManage: boolean
  isDm: boolean
  onEdit: () => void
  onDelete: () => void
  onLeave: () => void
}) => {
  const { t } = useTranslation()

  return (
    <>
      {canManage ? (
        <>
          <Item onSelect={onEdit}>{t("rooms.edit")}</Item>
          <Separator />
          <Item variant="destructive" onSelect={onDelete}>
            {t("rooms.delete")}
          </Item>
        </>
      ) : isDm ? (
        <Item onSelect={onLeave}>{t("rooms.close")}</Item>
      ) : (
        <Item variant="destructive" onSelect={onLeave}>
          {t("rooms.leave")}
        </Item>
      )}
    </>
  )
}

const RoomsBox = ({
  currentRoom,
  onRoomSelect,
}: {
  currentRoom: RoomResp | null
  onRoomSelect?: (room: RoomResp) => void
}) => {
  const rooms = useRoomsStore((s) => s.rooms)
  const setRoom = useMainPageStore((s) => s.setRoom)
  const user = useMainPageStore((s) => s.user)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const [editRoom, setEditRoom] = useState<RoomResp | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<RoomResp | null>(null)
  const [confirmLeave, setConfirmLeave] = useState<RoomResp | null>(null)

  const leaveRoom = async (roomId: number) => {
    if (!user) return
    const room = rooms.find((r) => r.id === roomId)
    try {
      await tokenHttpClient.delete(`/api/rooms/${roomId}/members/${user.id}`)
      setConfirmLeave(null)
      if (currentRoom?.id === roomId) {
        const generalRoom = rooms.find((r) => r.is_general)
        if (generalRoom) {
          setRoom(generalRoom)
          navigate(`/rooms/${generalRoom.id}`)
        } else {
          setRoom(null)
        }
      }
    } catch (err) {
      notification.error(
        room?.is_dm ? t("rooms.closeFailed") : t("rooms.leaveFailed"),
        apiErrorMessage(err),
      )
    }
  }

  const deleteRoom = async (roomId: number) => {
    try {
      await tokenHttpClient.delete(`/api/rooms/${roomId}`)
      setConfirmDelete(null)
      if (currentRoom?.id === roomId) {
        const generalRoom = rooms.find((r) => r.is_general)
        if (generalRoom) {
          setRoom(generalRoom)
          navigate(`/rooms/${generalRoom.id}`)
        } else {
          setRoom(null)
        }
      }
    } catch (err) {
      notification.error(t("rooms.deleteFailed"), apiErrorMessage(err))
    }
  }

  if (!rooms) {
    return (
      <div className="h-full flex items-center justify-center border rounded-md">
        <div className="text-sm text-muted-foreground">
          {t("rooms.loading")}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col h-full border rounded-md overflow-hidden">
        <div className="px-4 h-16 border-b flex items-center justify-between">
          <div className="font-medium">{t("rooms.title")}</div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setCreateOpen(true)}
            aria-label={t("rooms.create")}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-3">
            {[...rooms]
              .sort((a, b) => a.id - b.id)
              .map((r) => {
                const unread = r.unread_count
                const isOwner = r.owner_id === user?.id
                const canManage = isOwner && !r.is_general && !r.is_dm
                const displayName = roomDisplayName(r, t)
                return (
                  <ContextMenu key={r.id}>
                    <ContextMenuTrigger asChild>
                      <div
                        className={cn(
                          "p-3 rounded-md shadow-sm transition-colors flex items-center justify-between cursor-pointer border",
                          "pointer-fine:hover:bg-muted/50 pointer-coarse:active:bg-muted/50",
                          r.id === currentRoom?.id &&
                            "text-primary border-primary",
                        )}
                        onClick={() => {
                          setRoom(r)
                          onRoomSelect?.(r)
                        }}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0 select-none">
                          <Avatar size="lg">
                            {r.avatar_url ? (
                              <AvatarImage
                                src={r.avatar_url}
                                alt={displayName}
                              />
                            ) : (
                              <AvatarFallback>
                                {getInitials(displayName)}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          <div className="font-medium text-base truncate">
                            {displayName}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {unread > 0 && (
                            <Badge className="min-w-5 tabular-nums">
                              {unread > 99 ? "99+" : unread}
                            </Badge>
                          )}
                          {!r.is_general && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  aria-label={t("rooms.openActions", {
                                    name: displayName,
                                  })}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-40"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <RoomMenuItems
                                  Item={DropdownMenuItem}
                                  Separator={DropdownMenuSeparator}
                                  canManage={canManage}
                                  isDm={r.is_dm}
                                  onEdit={() => setEditRoom(r)}
                                  onDelete={() => setConfirmDelete(r)}
                                  onLeave={() => setConfirmLeave(r)}
                                />
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    </ContextMenuTrigger>

                    {!r.is_general && (
                      <ContextMenuContent
                        className="min-w-40"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <RoomMenuItems
                          Item={ContextMenuItem}
                          Separator={ContextMenuSeparator}
                          canManage={canManage}
                          isDm={r.is_dm}
                          onEdit={() => setEditRoom(r)}
                          onDelete={() => setConfirmDelete(r)}
                          onLeave={() => setConfirmLeave(r)}
                        />
                      </ContextMenuContent>
                    )}
                  </ContextMenu>
                )
              })}
          </div>
        </div>
      </div>
      <CreateRoomDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editRoom && (
        <EditRoomDialog
          room={editRoom}
          open={editRoom !== null}
          onOpenChange={(open) => {
            if (!open) setEditRoom(null)
          }}
        />
      )}

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={() => setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rooms.deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("rooms.deleteConfirmMessage", {
                name: confirmDelete?.name,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && deleteRoom(confirmDelete.id)}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmLeave !== null}
        onOpenChange={() => setConfirmLeave(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmLeave?.is_dm
                ? t("rooms.closeConfirmTitle")
                : t("rooms.leaveConfirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {confirmLeave?.is_dm
                ? t("rooms.closeConfirmMessage", { name: confirmLeave?.name })
                : t("rooms.leaveConfirmMessage", { name: confirmLeave?.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmLeave(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant={confirmLeave?.is_dm ? "default" : "destructive"}
              onClick={() => confirmLeave && leaveRoom(confirmLeave.id)}
            >
              {confirmLeave?.is_dm ? t("rooms.close") : t("common.leave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default RoomsBox
