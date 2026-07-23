import { Button } from "@/components/ui/button"
import { EmojiPickerPopover } from "@/components/ui/emoji-picker-popover"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { useCloseOnBack } from "@/hooks/useCloseOnBack"
import { useEmojiPickerStore } from "@/hooks/useEmojiPickerStore"
import { useEmojiPickerViewport } from "@/hooks/useEmojiPickerViewport"
import { useTimeout } from "@mantine/hooks"
import { useTranslation } from "react-i18next"
import { FiSmile } from "react-icons/fi"

type Props = {
  onEmojiClick: (emoji: string) => void
}

const EmojiPickerBox = ({ onEmojiClick }: Props) => {
  const { t } = useTranslation()
  const showEmojiPicker = useEmojiPickerStore((s) => s.showEmojiPicker)
  const setShowEmojiPicker = useEmojiPickerStore((s) => s.setShowEmojiPicker)

  useCloseOnBack(showEmojiPicker, () => setShowEmojiPicker(false))

  const { isTouch } = useEmojiPickerViewport(showEmojiPicker)

  const { start: startCloseEmojiTimeout, clear: clearCloseEmojiTimeout } =
    useTimeout(() => {
      setShowEmojiPicker(false)
    }, 150)

  const handleMouseEnter = () => {
    clearCloseEmojiTimeout()
    setShowEmojiPicker(true)
  }

  const handleMouseLeave = () => {
    startCloseEmojiTimeout()
  }

  return (
    <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
      <PopoverTrigger asChild>
        <Button
          className="p-1"
          aria-label={t("emojiPicker.title")}
          variant="ghost"
          onMouseEnter={!isTouch ? handleMouseEnter : undefined}
          onMouseLeave={!isTouch ? handleMouseLeave : undefined}
        >
          <FiSmile className="size-5 text-primary" />
        </Button>
      </PopoverTrigger>

      <EmojiPickerPopover
        open={showEmojiPicker}
        onEmojiSelect={onEmojiClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
    </Popover>
  )
}

export default EmojiPickerBox
