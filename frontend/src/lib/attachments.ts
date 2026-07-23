import type { MessageAttachment } from "@eggplant/shared/api"

export type MediaKind = "image" | "video" | "audio" | "file"

/** Resolves the media kind of an attachment from its mime type. */
export function getMediaType(attachment: MessageAttachment): MediaKind {
  const mime = (attachment.type ?? "").toLowerCase()
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  return "file"
}

/** Whether the server generated a `preview_` thumbnail for this attachment. */
export function attachmentHasPreview(attachment: MessageAttachment): boolean {
  return attachment.has_preview
}

/** The direct / original file URL. */
export function attachmentDirectUrl(attachment: MessageAttachment): string {
  return `/uploads/files/${attachment.file_id}`
}

/** The preview thumbnail URL, or the direct URL when no preview exists. */
export function attachmentPreviewUrl(attachment: MessageAttachment): string {
  return attachmentHasPreview(attachment)
    ? `/uploads/files/preview_${attachment.file_id}`
    : attachmentDirectUrl(attachment)
}
