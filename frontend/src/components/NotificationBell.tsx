import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  TYPE_ACTION_LABEL_KEYS,
  useNotificationHistoryStore,
} from "@/context/notificationHistoryStore"
import i18n from "@/i18n"
import { Bell, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

const importanceBadge = {
  high: "destructive" as const,
  normal: "default" as const,
  low: "secondary" as const,
}

const importanceLabel = {
  high: "notifications.importance.high",
  normal: "notifications.importance.normal",
  low: "notifications.importance.low",
} as const

function formatTimestamp(ts: number): string {
  const diff = Date.now() - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return i18n.t("notifications.justNow")
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return i18n.t("notifications.minutesAgo", { minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return i18n.t("notifications.hoursAgo", { hours })
  const days = Math.floor(hours / 24)
  return i18n.t("notifications.daysAgo", { days })
}

export function NotificationBell() {
  const unreadCount = useNotificationHistoryStore((s) => s.unreadCount)
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="text-primary h-[1.2rem] w-[1.2rem]" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          <span className="sr-only">{t("notifications.title")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <NotificationList />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationList() {
  const notifications = useNotificationHistoryStore((s) => s.notifications)
  const dismissAllNotifications = useNotificationHistoryStore(
    (s) => s.dismissAllNotifications,
  )
  const dismissNotification = useNotificationHistoryStore(
    (s) => s.dismissNotification,
  )
  const navigate = useNavigate()
  const { t } = useTranslation()

  const count = notifications.length

  return (
    <>
      {count > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <span className="text-xs text-muted-foreground">
            {t("notifications.count", { count })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              dismissAllNotifications()
            }}
          >
            <X className="mr-1 h-3 w-3" />
            {t("notifications.dismissAll")}
          </Button>
        </div>
      )}
      <ScrollArea className="max-h-72">
        {count === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t("notifications.empty")}
          </div>
        ) : (
          notifications.map((n) => {
            const displayTitle = t(`notifications.types.${n.type}` as never, {
              defaultValue: "",
              ...(n.params ?? {}),
            }) as string
            const actionLabelKey = TYPE_ACTION_LABEL_KEYS[n.type]
            const displayActionLabel = actionLabelKey
              ? (t(actionLabelKey as never) as string)
              : undefined
            return (
              <DropdownMenuItem
                key={n.id}
                className="flex flex-col items-start gap-1 px-4 py-3 cursor-default"
                onSelect={(e) => e.preventDefault()}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="truncate text-sm font-medium">
                      {displayTitle}
                    </span>
                  </div>
                  <Badge
                    variant={importanceBadge[n.importance]}
                    className="shrink-0 text-[10px]"
                  >
                    {t(importanceLabel[n.importance])}
                  </Badge>
                </div>
                {n.description && (
                  <span className="text-xs text-muted-foreground">
                    {n.description}
                  </span>
                )}
                {displayActionLabel && n.actionToken && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px] mt-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/invitation/${n.actionToken}`)
                      dismissNotification(n.id)
                    }}
                  >
                    {displayActionLabel}
                  </Button>
                )}
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground/70">
                    {formatTimestamp(n.timestamp)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation()
                      dismissNotification(n.id)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </DropdownMenuItem>
            )
          })
        )}
      </ScrollArea>
    </>
  )
}
