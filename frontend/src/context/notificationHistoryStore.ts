import i18n from "@/i18n"
import tokenHttpClient from "@/lib/tokenHttpClient"
import type { NotificationResp } from "@eggplant/shared/api"
import { toast } from "sonner"
import { create } from "zustand"

export type NotificationImportance = "high" | "normal" | "low"

export type NotificationItem = {
  id: string
  type: string
  params?: Record<string, string | number>
  description?: string
  importance: NotificationImportance
  timestamp: number
  actionToken?: string
}

export type AddNotificationOptions = {
  id?: string
  duration?: number | typeof Infinity
  actionToken?: string
}

export const TYPE_ACTION_LABEL_KEYS: Record<string, string> = {
  room_invitation: "common.open",
}

function typeTitle(type: string): string {
  return i18n.t(`notifications.types.${type}` as never, {
    defaultValue: "",
  }) as string
}

function typeActionLabel(type: string): string | undefined {
  const key = TYPE_ACTION_LABEL_KEYS[type]
  return key ? (i18n.t(key as never) as string) : undefined
}

type NotificationHistoryState = {
  notifications: NotificationItem[]
  unreadCount: number
  addPersistentNotification: (
    variant: "success" | "error",
    type: string,
    params: Record<string, string | number> | undefined,
    description: string | undefined,
    importance: NotificationImportance,
    options?: AddNotificationOptions,
  ) => string
  mergeServerNotifications: (items: NotificationItem[]) => void
  dismissToast: (id: string) => void
  dismissNotification: (id: string) => void
  dismissAllNotifications: () => void
  dismissByActionToken: (token: string) => void
}

function calcUnread(notifications: NotificationItem[]): number {
  let count = 0
  for (const n of notifications) {
    if (n.importance !== "low") count++
  }
  return count
}

let notificationId = 0
function nextId(): string {
  return `notif-${++notificationId}`
}

function historyUpdate(
  state: NotificationHistoryState,
  item: NotificationItem,
  options: AddNotificationOptions | undefined,
) {
  const withoutOld = options?.id
    ? state.notifications.filter((n) => n.id !== options.id)
    : state.notifications
  const notifications = [item, ...withoutOld].slice(0, 50)
  return { notifications, unreadCount: calcUnread(notifications) }
}

export const useNotificationHistoryStore = create<NotificationHistoryState>()(
  (set) => ({
    notifications: [],
    unreadCount: 0,

    addPersistentNotification: (
      variant,
      type,
      params,
      description,
      importance,
      options,
    ) => {
      const id = options?.id ?? nextId()
      const title = typeTitle(type)
      const actionLabel = typeActionLabel(type)

      const toastOpts: Record<string, unknown> = { id, description }
      if (options?.duration !== undefined) {
        toastOpts.duration = options.duration
      }
      if (actionLabel && options?.actionToken) {
        toastOpts.action = {
          label: actionLabel,
          onClick: () => {
            window.location.href = `/invitation/${options.actionToken}`
          },
        }
      }

      if (variant === "success") {
        toast.success(title, toastOpts)
      } else {
        toast.error(title, toastOpts)
      }

      const item: NotificationItem = {
        id,
        type,
        params,
        description,
        importance,
        timestamp: Date.now(),
        actionToken: options?.actionToken,
      }
      set((state) => historyUpdate(state, item, options))

      return id
    },

    mergeServerNotifications: (items) =>
      set((state) => {
        const byId = new Map<string, NotificationItem>()
        for (const n of state.notifications) byId.set(n.id, n)
        for (const item of items) byId.set(item.id, item)
        const merged = Array.from(byId.values())
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 50)
        return { notifications: merged, unreadCount: calcUnread(merged) }
      }),

    dismissToast: (id: string) => {
      toast.dismiss(id)
    },

    dismissNotification: (id: string) =>
      set((state) => {
        const item = state.notifications.find((n) => n.id === id)
        if (item?.actionToken) {
          void tokenHttpClient.delete(
            `/api/notifications/token/${item.actionToken}`,
          )
        }
        const notifications = state.notifications.filter((n) => n.id !== id)
        return { notifications, unreadCount: calcUnread(notifications) }
      }),

    dismissAllNotifications: () => {
      void tokenHttpClient.delete("/api/notifications")
      set({ notifications: [], unreadCount: 0 })
    },

    dismissByActionToken: (token) =>
      set((state) => {
        const notifications = state.notifications.filter(
          (n) => n.actionToken !== token,
        )
        return { notifications, unreadCount: calcUnread(notifications) }
      }),
  }),
)

export const notification = {
  success: (title: string, description?: string) => {
    toast.success(title, { description })
  },
  error: (title: string, description?: string) => {
    toast.error(title, { description })
  },
  info: (title: string, description?: string) => {
    toast(title, { description })
  },
  persistent: {
    success: (
      type: string,
      params: Record<string, string | number> | undefined,
      description: string | undefined,
      importance: NotificationImportance,
      options?: AddNotificationOptions,
    ) => {
      return useNotificationHistoryStore
        .getState()
        .addPersistentNotification(
          "success",
          type,
          params,
          description,
          importance,
          options,
        )
    },
    error: (
      type: string,
      params: Record<string, string | number> | undefined,
      description: string | undefined,
      importance: NotificationImportance,
      options?: AddNotificationOptions,
    ) => {
      return useNotificationHistoryStore
        .getState()
        .addPersistentNotification(
          "error",
          type,
          params,
          description,
          importance,
          options,
        )
    },
  },
  dismiss: (id: string) => {
    toast.dismiss(id)
  },
}

export function serverNotificationToItem(
  n: NotificationResp,
): NotificationItem {
  return {
    id:
      n.invitation_id !== null ? `invite:${n.invitation_id}` : `server:${n.id}`,
    type: n.type,
    params: n.params ?? undefined,
    description: n.description ?? undefined,
    importance: n.importance,
    timestamp: new Date(n.created_at).getTime(),
    actionToken: n.action_token ?? undefined,
  }
}
