"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { Pause, Play } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function MessageAudioPlayer({
  src,
  className,
  name,
}: {
  src: string
  className?: string
  name?: string
}) {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTime = () => setCurrent(audio.currentTime)
    const onDuration = () => setDuration(audio.duration)
    const onEnded = () => {
      setPlaying(false)
      setCurrent(0)
    }

    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("durationchange", onDuration)
    audio.addEventListener("loadedmetadata", onDuration)
    audio.addEventListener("ended", onEnded)

    return () => {
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("durationchange", onDuration)
      audio.removeEventListener("loadedmetadata", onDuration)
      audio.removeEventListener("ended", onEnded)
    }
  }, [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      void audio.play().catch(() => undefined)
    } else {
      audio.pause()
    }
  }

  const seek = (value: number[]) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = value[0]
    setCurrent(value[0])
  }

  const max = duration > 0 && Number.isFinite(duration) ? duration : 0

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm",
        className,
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        aria-label={name}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggle}
        className="size-9 shrink-0"
        aria-label={playing ? t("audio.pause") : t("audio.play")}
      >
        {playing ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="size-4 translate-x-0.5 fill-current" />
        )}
      </Button>

      {name && (
        <div className="hidden min-w-0 max-w-40 truncate sm:block">
          <div className="truncate font-medium text-foreground">{name}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatTime(current)}
        </span>
        <Slider
          className="min-w-0 flex-1"
          value={[current]}
          max={max || 1}
          step={0.1}
          onValueChange={seek}
          disabled={max === 0}
        />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}
