import { create } from "zustand"

type EmojiPickerState = {
  showEmojiPicker: boolean
  setShowEmojiPicker: (show: boolean) => void
}

export const useEmojiPickerStore = create<EmojiPickerState>((set) => ({
  showEmojiPicker: false,
  setShowEmojiPicker: (show: boolean) => set({ showEmojiPicker: show }),
}))
