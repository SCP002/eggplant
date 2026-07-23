import { EmojiPickerPopover } from "@/components/ui/emoji-picker-popover"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCloseOnBack } from "@/hooks/useCloseOnBack"
import i18n from "@/i18n"
import { cn } from "@/lib/utils"
import type { MessageReaction, MessageResp } from "@eggplant/shared/api"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { FiPlus } from "react-icons/fi"

const MAX_VISIBLE_REACTIONS = 10
const TOOLTIP_USERS_LIMIT = 10

function formatReactionUsers(users: MessageReaction["users"]): string {
  const names = users.map((u) => u.username)
  if (names.length === 0) return ""
  if (names.length <= TOOLTIP_USERS_LIMIT) {
    return names.join(", ")
  }
  return i18n.t("reactions.more", {
    names: names.slice(0, TOOLTIP_USERS_LIMIT).join(", "),
    count: names.length - TOOLTIP_USERS_LIMIT,
  })
}

const MessageReactions = ({
  message,
  currentUserId,
  onToggleReaction,
  className,
}: {
  message: MessageResp
  currentUserId: number | null
  onToggleReaction: (messageId: number, emoji: string) => void
  className?: string
}) => {
  const reactions = useMemo(() => {
    const list = [...(message.reactions ?? [])]
    list.sort(
      (a, b) =>
        b.users.length - a.users.length || a.emoji.localeCompare(b.emoji),
    )
    return list
  }, [message.reactions])
  const { t } = useTranslation()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [allOpen, setAllOpen] = useState(false)

  useCloseOnBack(pickerOpen, () => setPickerOpen(false))

  const visible = reactions.slice(0, MAX_VISIBLE_REACTIONS)
  const hiddenCount = reactions.length - visible.length

  const reactedByMe = (reaction: MessageReaction) =>
    currentUserId !== null && reaction.users.some((u) => u.id === currentUserId)

  const renderChip = (reaction: MessageReaction) => {
    const mine = reactedByMe(reaction)
    return (
      <Tooltip key={reaction.emoji}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onToggleReaction(message.id, reaction.emoji)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition-colors",
              mine
                ? "bg-primary/20 border-primary/40 hover:bg-primary/30"
                : "border-transparent bg-muted/40 hover:bg-muted",
            )}
          >
            <span>{reaction.emoji}</span>
            <span
              className={cn(mine ? "text-primary" : "text-muted-foreground")}
            >
              {reaction.users.length}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{formatReactionUsers(reaction.users)}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visible.map(renderChip)}

      {hiddenCount > 0 && (
        <Popover open={allOpen} onOpenChange={setAllOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 rounded-full border border-transparent bg-muted/40 px-2 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              +{hiddenCount}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <div className="flex flex-col gap-1.5">
              <div className="text-sm font-medium">{t("reactions.all")}</div>
              {reactions.map((reaction) => {
                const mine = reactedByMe(reaction)
                return (
                  <div key={reaction.emoji} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onToggleReaction(message.id, reaction.emoji)
                        setAllOpen(false)
                      }}
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition-colors shrink-0",
                        mine
                          ? "bg-primary/20 border-primary/40 hover:bg-primary/30"
                          : "border-transparent hover:bg-muted",
                      )}
                    >
                      <span>{reaction.emoji}</span>
                      <span
                        className={cn(
                          mine ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {reaction.users.length}
                      </span>
                    </button>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {formatReactionUsers(reaction.users)}
                    </span>
                  </div>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("reactions.add")}
            className={cn(
              "items-center gap-1 rounded-full border border-transparent bg-muted/40 px-2 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-muted",
              reactions.length === 0
                ? "invisible pointer-coarse:visible group-hover:visible data-[state=open]:visible"
                : "flex",
            )}
          >
            <FiPlus className="size-3.5" />
          </button>
        </PopoverTrigger>
        <EmojiPickerPopover
          open={pickerOpen}
          align="start"
          className="data-closed:animate-none!"
          onEmojiSelect={(emoji) => {
            onToggleReaction(message.id, emoji)
            setPickerOpen(false)
          }}
        />
      </Popover>
    </div>
  )
}

export default MessageReactions
