"use client"

import { createSlatePlugin, TextApi } from "platejs"
import type { PlateLeafProps } from "platejs/react"
import { PlateLeaf } from "platejs/react"

const EMOJI_ONLY_KEY = "bigEmoji"
const emojiRx = /[\p{Emoji_Presentation}\uFE0F\u200D]+\uFE0F?/gu

const decorateBigEmoji: import("platejs").Decorate = ({
  entry: [node, path],
}) => {
  if (!TextApi.isText(node)) return

  const text = node.text
  if (!text) return

  const match = text.match(emojiRx)
  if (!match) return
  if (match.join("") !== text) return

  return [
    {
      anchor: { path, offset: 0 },
      focus: { path, offset: text.length },
      [EMOJI_ONLY_KEY]: true,
    },
  ]
}

export function BigEmojiLeaf(props: PlateLeafProps) {
  const { leaf } = props
  if (!leaf[EMOJI_ONLY_KEY]) return <>{props.children}</>

  return <PlateLeaf {...props} className="text-[1.7em] leading-[1.2]" />
}

export const BigEmojiPlugin = createSlatePlugin({
  key: EMOJI_ONLY_KEY,
  node: { isLeaf: true },
  decorate: decorateBigEmoji,
  render: { node: BigEmojiLeaf },
})
