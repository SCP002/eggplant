import { useVisualViewport } from "@/hooks/useVisualViewport"
import { useMediaQuery } from "usehooks-ts"

export const PICKER_SIZE = 400
export const PICKER_VIEWPORT_MARGIN = 8

export const useEmojiPickerViewport = (open: boolean) => {
  const visualViewport = useVisualViewport(open)
  const isTouch = useMediaQuery("(pointer: coarse)")
  const keyboardInset = Math.max(
    0,
    window.innerHeight - (visualViewport.offsetTop + visualViewport.height),
  )
  const pickerSize = Math.min(
    PICKER_SIZE,
    Math.max(0, visualViewport.height - PICKER_VIEWPORT_MARGIN * 2),
  )
  const pickerMaxWidth = Math.max(
    0,
    visualViewport.width - PICKER_VIEWPORT_MARGIN * 2,
  )
  const pickerAnchor = {
    left: visualViewport.offsetLeft + visualViewport.width / 2,
    top: visualViewport.offsetTop + visualViewport.height,
  }
  return { isTouch, keyboardInset, pickerSize, pickerMaxWidth, pickerAnchor }
}
