import AvatarCropDialog from "@/components/AvatarCropDialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { notification } from "@/context/notificationHistoryStore"
import { apiErrorMessage } from "@/lib/apiErrorMessage"
import tokenHttpClient from "@/lib/tokenHttpClient"
import { getInitials } from "@/lib/utils"
import type { RoomResp } from "@eggplant/shared/api"
import { useRef, useState, type ChangeEvent } from "react"
import { useTranslation } from "react-i18next"

const EditRoomDialog = ({
  room,
  open,
  onOpenChange,
}: {
  room: RoomResp
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const [name, setName] = useState(room.name)
  const [avatarSrc, setAvatarSrc] = useState<string | null>(room.avatar_url)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [cropImage, setCropImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleAvatarSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCropImage(URL.createObjectURL(file))
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleCrop = (blob: Blob) => {
    const file = new File([blob], "avatar.png", { type: "image/png" })
    setAvatarFile(file)
    setAvatarSrc(URL.createObjectURL(file))
    setCropImage(null)
  }

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const formData = new FormData()
      if (name.trim() !== room.name) {
        formData.append("name", name.trim())
      }
      if (avatarFile) {
        formData.append("file", avatarFile)
      }
      await tokenHttpClient.put(`/api/rooms/${room.id}`, formData)
      notification.success(t("editRoom.updated"), t("editRoom.updatedMessage"))
      onOpenChange(false)
      setAvatarFile(null)
    } catch (err) {
      notification.error(t("editRoom.failed"), apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("editRoom.title")}</DialogTitle>
          </DialogHeader>
          <div className="py-4 flex flex-col gap-4">
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer"
              >
                <Avatar size="lg">
                  {avatarSrc ? (
                    <AvatarImage
                      src={avatarSrc}
                      alt={t("editRoom.avatarAlt", { name: room.name })}
                    />
                  ) : (
                    <AvatarFallback>{getInitials(name.trim())}</AvatarFallback>
                  )}
                </Avatar>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                className="sr-only"
              />
            </div>
            <Input
              placeholder={t("common.roomName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {cropImage && (
        <AvatarCropDialog
          open={!!cropImage}
          image={cropImage}
          onOpenChange={() => setCropImage(null)}
          onCrop={handleCrop}
        />
      )}
    </Dialog>
  )
}

export default EditRoomDialog
