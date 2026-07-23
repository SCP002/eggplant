"use client"

import { BigEmojiPlugin } from "@/components/editor/plugins/big-emoji-plugin"
import { EmojiInputElement } from "@/components/ui/emoji-node"
import emojiMartData, { type EmojiMartData } from "@emoji-mart/data"
import { EmojiInputPlugin, EmojiPlugin } from "@platejs/emoji/react"

export const EmojiKit = [
  EmojiPlugin.configure({
    options: { data: emojiMartData as EmojiMartData },
  }),
  EmojiInputPlugin.withComponent(EmojiInputElement),
  BigEmojiPlugin,
]
