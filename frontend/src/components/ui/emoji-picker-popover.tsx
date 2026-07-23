"use client"

import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker"
import { PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import {
  PICKER_VIEWPORT_MARGIN,
  useEmojiPickerViewport,
} from "@/hooks/useEmojiPickerViewport"
import { cn } from "@/lib/utils"
import type { Emoji } from "frimousse"

const EMOJI_BASE_URL = "/emojibase-data/en/node_modules/emojibase-data"

type EmojiPickerPopoverProps = {
  open: boolean
  onEmojiSelect: (emoji: string) => void
  /** Horizontal alignment used on non-touch devices. */
  align?: "start" | "center" | "end"
  className?: string
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export function EmojiPickerPopover({
  open,
  onEmojiSelect,
  align = "center",
  className,
  onMouseEnter,
  onMouseLeave,
}: EmojiPickerPopoverProps) {
  const { isTouch, keyboardInset, pickerSize, pickerMaxWidth, pickerAnchor } =
    useEmojiPickerViewport(open)

  return (
    <>
      {isTouch && open && (
        <PopoverAnchor asChild>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed"
            style={{ ...pickerAnchor, width: 1, height: 1 }}
          />
        </PopoverAnchor>
      )}
      <PopoverContent
        className={cn("w-fit p-0", className)}
        align={isTouch ? "center" : align}
        side={isTouch ? "top" : "bottom"}
        sideOffset={isTouch ? PICKER_VIEWPORT_MARGIN : undefined}
        collisionPadding={{ bottom: keyboardInset + PICKER_VIEWPORT_MARGIN }}
        onOpenAutoFocus={(event) => {
          if (isTouch) event.preventDefault()
        }}
        onMouseEnter={!isTouch ? onMouseEnter : undefined}
        onMouseLeave={!isTouch ? onMouseLeave : undefined}
      >
        <EmojiPicker
          emojibaseUrl={EMOJI_BASE_URL}
          className="h-100 rounded-lg border shadow-md"
          style={
            isTouch
              ? {
                  height: pickerSize,
                  maxWidth: pickerMaxWidth,
                }
              : undefined
          }
          onEmojiSelect={(emoji: Emoji) => onEmojiSelect(emoji.emoji)}
        >
          <EmojiPickerSearch />
          <EmojiPickerContent />
          <EmojiPickerFooter />
        </EmojiPicker>
      </PopoverContent>
    </>
  )
}
