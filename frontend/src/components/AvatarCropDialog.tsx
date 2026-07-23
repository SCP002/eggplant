import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { useCallback, useRef, useState } from "react"
import Cropper, { type Area } from "react-easy-crop"
import { useTranslation } from "react-i18next"

const MAX_IMAGE_SIZE = 512

type Props = {
  open: boolean
  image: string
  onOpenChange: (open: boolean) => void
  onCrop: (blob: Blob) => void
}

const AvatarCropDialog = ({ open, image, onOpenChange, onCrop }: Props) => {
  const { t } = useTranslation()
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const croppedAreaPixelsRef = useRef<Area | null>(null)

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    croppedAreaPixelsRef.current = croppedAreaPixels
  }, [])

  const handleApply = useCallback(async () => {
    const pixelCrop = croppedAreaPixelsRef.current
    if (!pixelCrop) return

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = image
    await img.decode()

    const canvas = document.createElement("canvas")
    canvas.width = MAX_IMAGE_SIZE
    canvas.height = MAX_IMAGE_SIZE
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(
      img,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      MAX_IMAGE_SIZE,
      MAX_IMAGE_SIZE,
    )

    canvas.toBlob((blob) => {
      if (!blob) return
      onCrop(blob)
      onOpenChange(false)
    }, "image/png")
  }, [image, onCrop, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("avatarCrop.title")}</DialogTitle>
        </DialogHeader>
        <div className="relative size-full min-h-100 overflow-hidden rounded-md bg-black/5">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="flex items-center gap-3 px-1">
          <span className="text-xs text-muted-foreground">
            {t("avatarCrop.zoom")}
          </span>
          <Slider
            value={[zoom]}
            min={1}
            max={3}
            step={0.05}
            onValueChange={([v]) => setZoom(v)}
            className="flex-1"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleApply}>{t("avatarCrop.cropAndUpload")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AvatarCropDialog
