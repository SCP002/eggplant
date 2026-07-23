import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { notification } from "@/context/notificationHistoryStore"
import { getInitials } from "@/lib/utils"
import type { User } from "@eggplant/shared/api"
import { Copy, Hash } from "lucide-react"
import { useCallback, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

const UserInfoCard = ({
  user,
  children,
}: {
  user: User
  children: ReactNode
}) => {
  const { t } = useTranslation()

  const copyUid = useCallback(() => {
    navigator.clipboard.writeText(String(user.id))
    notification.success(
      t("userInfo.uidCopied"),
      t("userInfo.uidCopiedMessage", { id: user.id }),
    )
  }, [user.id, t])

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72" align="start" collisionPadding={12}>
        <div className="flex items-start gap-3">
          <Avatar size="lg">
            {user.avatar_url ? (
              <AvatarImage src={user.avatar_url} alt={user.username} />
            ) : (
              <AvatarFallback>{getInitials(user.username)}</AvatarFallback>
            )}
          </Avatar>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="font-semibold text-base truncate">
              {user.username}
            </div>
            {user.email && (
              <div className="text-xs text-muted-foreground truncate">
                {user.email}
              </div>
            )}
            <button
              type="button"
              onClick={copyUid}
              className="mt-2 inline-flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm font-mono text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-fit"
              title={t("userInfo.copyUidTitle")}
            >
              <Hash className="size-3.5" />
              <span>{t("userInfo.uid", { id: user.id })}</span>
              <Copy className="size-3" />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default UserInfoCard
