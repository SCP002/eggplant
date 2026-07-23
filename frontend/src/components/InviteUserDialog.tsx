import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { notification } from "@/context/notificationHistoryStore"
import { apiErrorMessage } from "@/lib/apiErrorMessage"
import tokenHttpClient from "@/lib/tokenHttpClient"
import { getInitials } from "@/lib/utils"
import type { RoomInvitationResp, UserSearchResult } from "@eggplant/shared/api"
import { Copy, Globe, Trash2, UserPlus } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

const InviteUserDialog = ({
  open,
  onOpenChange,
  roomId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: number
}) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [existingInvitations, setExistingInvitations] = useState<
    RoomInvitationResp[]
  >([])

  const fetchInvitations = useCallback(async () => {
    try {
      const res = await tokenHttpClient.get<RoomInvitationResp[]>(
        `/api/rooms/${roomId}/invitations`,
      )
      setExistingInvitations(res.data)
    } catch {
      setExistingInvitations([])
    }
  }, [roomId])

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setQuery("")
      setExistingInvitations([])
    }
  }

  useEffect(() => {
    if (!open) return
    const load = async () => {
      await fetchInvitations()
    }
    void load()
  }, [open, fetchInvitations])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setSearchLoading(true)
    try {
      const res = await tokenHttpClient.get<UserSearchResult[]>(
        "/api/users/search",
        {
          params: { q: q.trim() },
        },
      )
      setResults(res.data)
    } catch {
      setResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  const generateGlobalLink = async () => {
    try {
      await tokenHttpClient.post<RoomInvitationResp>(
        `/api/rooms/${roomId}/invitations`,
        {},
      )
      fetchInvitations()
    } catch (err) {
      notification.error(t("invite.generateFailed"), apiErrorMessage(err))
    }
  }

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link)
    notification.success(t("invite.linkCopied"), t("invite.linkCopiedMessage"))
  }

  const deleteInvitation = async (invitationId: number) => {
    try {
      await tokenHttpClient.delete(
        `/api/rooms/${roomId}/invitations/${invitationId}`,
      )
      fetchInvitations()
      notification.success(t("invite.deleted"), t("invite.deletedMessage"))
    } catch (err) {
      notification.error(t("invite.deleteFailed"), apiErrorMessage(err))
    }
  }

  const inviteUser = async (userId: number) => {
    try {
      await tokenHttpClient.post<RoomInvitationResp>(
        `/api/rooms/${roomId}/invitations`,
        { invitee_id: userId },
      )
      notification.success(t("invite.created"), t("invite.createdMessage"))
      setResults((prev) => prev.filter((r) => r.id !== userId))
      fetchInvitations()
    } catch (err) {
      notification.error(t("invite.inviteFailed"), apiErrorMessage(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("invite.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {existingInvitations.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {t("invite.activeInvitations")}
              </h4>
              {existingInvitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center gap-2 p-2 rounded-md border bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      {inv.is_global
                        ? t("invite.globalLink")
                        : (inv.invitee_username ??
                          t("invite.userId", { id: inv.invitee_id }))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() =>
                      copyLink(
                        `${window.location.origin}/invitation/${inv.token}`,
                      )
                    }
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-destructive hover:text-destructive"
                    onClick={() => deleteInvitation(inv.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="border-t pt-1" />
            </div>
          )}

          <div>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={generateGlobalLink}
            >
              <Globe className="h-4 w-4" />
              {t("invite.generateGlobalLink")}
            </Button>
            <span className="text-xs text-muted-foreground mt-1 block">
              {t("invite.globalLinkHint")}
            </span>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-2 text-muted-foreground">
                {t("invite.orInviteSpecific")}
              </span>
            </div>
          </div>

          <div>
            <Input
              placeholder={t("invite.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="max-h-48 overflow-y-auto">
            {searchLoading && (
              <p className="text-center text-sm text-muted-foreground py-4">
                {t("invite.searching")}
              </p>
            )}
            {!searchLoading && query.trim() && results.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                {t("invite.noUsers")}
              </p>
            )}
            {results.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
              >
                <Avatar size="sm">
                  {u.avatar_url ? (
                    <AvatarImage src={u.avatar_url} />
                  ) : (
                    <AvatarFallback>{getInitials(u.username)}</AvatarFallback>
                  )}
                </Avatar>
                <span className="flex-1 font-medium text-sm">{u.username}</span>
                <Button size="sm" onClick={() => inviteUser(u.id)}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  {t("invite.invite")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default InviteUserDialog
