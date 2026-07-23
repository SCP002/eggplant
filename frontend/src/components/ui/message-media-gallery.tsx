"use client"

import { NativeFileVideo } from "@/components/ui/native-file-video"
import { useCloseOnBack } from "@/hooks/useCloseOnBack"
import { attachmentDirectUrl, attachmentPreviewUrl } from "@/lib/attachments"
import { resolveAbsoluteUrl } from "@/lib/utils"
import { Capacitor } from "@capacitor/core"
import type { MessageAttachment } from "@eggplant/shared/api"
import { Play } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import ReactPlayer from "react-player"
import Lightbox from "yet-another-react-lightbox"
import Video from "yet-another-react-lightbox/plugins/video"
import "yet-another-react-lightbox/styles.css"

type MediaKind = "image" | "video"

interface Slide {
  kind: MediaKind
  previewUrl: string
  fullUrl: string
  mimeType: string
  name?: string
}

function getMediaKind(attachment: MessageAttachment): MediaKind {
  const mime = (attachment.type ?? "").toLowerCase()
  if (mime.startsWith("video/")) return "video"
  const name = (attachment.name ?? "").toLowerCase()
  if (/\.(mp4|webm|ogg|mov|m4v)$/.test(name)) return "video"
  return "image"
}

/**
 * Renders a message's image/video attachments.
 */
export function MessageMediaGallery({
  attachments,
  className,
}: {
  attachments: MessageAttachment[]
  className?: string
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)

  const slides = useMemo<Slide[]>(
    () =>
      attachments.map((a) => {
        const kind = getMediaKind(a)
        return {
          kind,
          previewUrl: resolveAbsoluteUrl(attachmentPreviewUrl(a)),
          fullUrl: resolveAbsoluteUrl(attachmentDirectUrl(a)),
          mimeType: a.type ?? "",
          name: a.name ?? undefined,
        }
      }),
    [attachments],
  )

  const openAt = (i: number) => {
    setIndex(i)
    setOpen(true)
  }

  // While the lightbox is open, register a closer so the Android back button
  // can close it instead of navigating to the rooms list.
  useCloseOnBack(open, () => setOpen(false))

  // Single media plays/previews inline without a lightbox.
  if (slides.length === 1) {
    const s = slides[0]
    if (s.kind === "video") {
      if (Capacitor.isNativePlatform()) {
        return (
          <div className={className}>
            <NativeFileVideo
              url={s.fullUrl}
              playerId={`chat-video-${attachments[0].file_id}`}
            />
          </div>
        )
      }
      return (
        <div
          className={`aspect-video max-w-120 overflow-hidden rounded-sm bg-black ${className ?? ""}`}
        >
          <ReactPlayer
            src={s.fullUrl}
            width="100%"
            height="100%"
            controls
            playsInline
            preload="metadata"
          />
        </div>
      )
    }
    return (
      <>
        <button
          type="button"
          onClick={() => openAt(0)}
          className={`block w-fit max-w-120 overflow-hidden rounded-sm ${className ?? ""}`}
          aria-label={t("media.openImage")}
        >
          <img
            src={s.previewUrl}
            alt={s.name ?? t("media.imageAlt")}
            loading="lazy"
            className="h-auto max-h-120 w-auto max-w-full rounded-sm object-contain"
          />
        </button>
        <MediaLightbox
          slides={slides}
          open={open}
          index={index}
          onClose={() => setOpen(false)}
        />
      </>
    )
  }

  // Multiple media. On Android, videos must use the native fullscreen player
  // and never the webview lightbox, so they are rendered as self-contained
  // native tiles; only images open the shared lightbox. Other platforms put all
  // media in the grid -> lightbox (videos play in the lightbox).
  const isNative = Capacitor.isNativePlatform()
  const imageSlides = slides.filter((s) => s.kind === "image")
  const imageIndices = slides
    .map((s, i) => (s.kind === "image" ? i : -1))
    .filter((i) => i >= 0)

  return (
    <>
      <div className={`grid max-w-120 grid-cols-2 gap-2 ${className ?? ""}`}>
        {slides.map((s, i) =>
          isNative && s.kind === "video" ? (
            <div key={attachments[i].file_id} className="aspect-square w-full">
              <NativeFileVideo
                url={s.fullUrl}
                playerId={`chat-video-${attachments[i].file_id}`}
              />
            </div>
          ) : (
            <button
              key={attachments[i].file_id}
              type="button"
              onClick={() => openAt(i)}
              className="aspect-square w-full overflow-hidden rounded-sm"
              aria-label={t("media.openMedia")}
            >
              <PreviewCell slide={s} />
            </button>
          ),
        )}
      </div>

      {isNative ? (
        imageSlides.length > 0 && (
          <MediaLightbox
            slides={imageSlides}
            open={open}
            index={Math.max(imageIndices.indexOf(index), 0)}
            onClose={() => setOpen(false)}
          />
        )
      ) : (
        <MediaLightbox
          slides={slides}
          open={open}
          index={index}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function MediaLightbox({
  slides,
  open,
  index,
  onClose,
}: {
  slides: Slide[]
  open: boolean
  index: number
  onClose: () => void
}) {
  return (
    <Lightbox
      open={open}
      close={onClose}
      index={index}
      slides={slides.map((s) =>
        s.kind === "video"
          ? {
              type: "video" as const,
              sources: [{ src: s.fullUrl, type: s.mimeType }],
              controls: true,
              playsInline: true,
              autoPlay: true,
              preload: "metadata",
            }
          : {
              type: "image" as const,
              src: s.fullUrl,
              alt: s.name,
            },
      )}
      plugins={[Video]}
      video={{ autoPlay: true }}
    />
  )
}

function PreviewCell({ slide }: { slide: Slide }) {
  const isVideo = slide.kind === "video"
  return (
    <div className="relative size-full overflow-hidden">
      {isVideo ? (
        <video
          src={slide.fullUrl}
          preload="metadata"
          playsInline
          className="size-full object-cover"
        />
      ) : (
        <img
          src={slide.previewUrl}
          alt={slide.name ?? "image"}
          loading="lazy"
          className="size-full object-cover"
        />
      )}
      {isVideo && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-10 place-items-center rounded-full bg-black/50 text-white">
            <Play className="size-5 fill-current" />
          </span>
        </span>
      )}
    </div>
  )
}
