"use client"

import { MessageAudioPlayer } from "@/components/ui/message-audio-player"
import { attachmentDirectUrl, getMediaType } from "@/lib/attachments"
import { formatBytes } from "@/lib/formatBytes"
import { resolveAbsoluteUrl } from "@/lib/utils"
import type { MessageAttachment } from "@eggplant/shared/api"
import { FileIcon } from "lucide-react"

/**
 * Renders a non-gallery attachment inline: an audio player, or a
 * compact downloadable chip for other files. Image/video attachments are
 * rendered in the gallery component instead.
 */
export function MessageMediaPreview({
  attachment,
  className,
}: {
  attachment: MessageAttachment
  className?: string
}) {
  const kind = getMediaType(attachment)
  const src = resolveAbsoluteUrl(attachmentDirectUrl(attachment))

  if (kind === "audio") {
    return (
      <MessageAudioPlayer
        key={attachment.file_id}
        src={src}
        name={attachment.name ?? undefined}
        className={`w-full max-w-100 ${className ?? ""}`}
      />
    )
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex max-w-60 items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-sm hover:bg-muted/70 ${className ?? ""}`}
    >
      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="truncate">{attachment.name ?? "file"}</div>
        <div className="text-xs text-muted-foreground">
          {attachment.size != null ? formatBytes(attachment.size) : ""}
        </div>
      </div>
    </a>
  )
}
