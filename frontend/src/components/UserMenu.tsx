import AvatarCropDialog from "@/components/AvatarCropDialog"
import ChangePasswordDialog from "@/components/ChangePasswordDialog"
import ChangeUsernameDialog from "@/components/ChangeUsernameDialog"
import DeleteAccountDialog from "@/components/DeleteAccountDialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { notification } from "@/context/notificationHistoryStore"
import { useUserMenuStore } from "@/context/userMenuStore"
import { useAuthStore } from "@/hooks/useAuthStore"
import { apiErrorMessage } from "@/lib/apiErrorMessage"
import tokenHttpClient from "@/lib/tokenHttpClient"
import { getInitials } from "@/lib/utils"
import type { User } from "@eggplant/shared/api"
import { ChevronDown, ChevronRight, Copy, Hash } from "lucide-react"
import { useRef, useState, type ChangeEvent, type ComponentProps } from "react"
import { useTranslation } from "react-i18next"

type Props = {
  user: User | null
} & ComponentProps<typeof Button>

const UserMenu = ({ user, ...buttonProps }: Props) => {
  const logout = useAuthStore((s) => s.logout)
  const { t } = useTranslation()
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [cropImage, setCropImage] = useState<string | null>(null)

  const menuOpen = useUserMenuStore((s) => s.menuOpen)
  const setMenuOpen = useUserMenuStore((s) => s.setMenuOpen)

  const changeUsernameDialogOpen = useUserMenuStore((s) => s.changeUsernameOpen)
  const setChangeUsernameDialogOpen = useUserMenuStore(
    (s) => s.setChangeUsernameOpen,
  )

  const changePasswordDialogOpen = useUserMenuStore((s) => s.changePasswordOpen)
  const setChangePasswordDialogOpen = useUserMenuStore(
    (s) => s.setChangePasswordOpen,
  )

  const deleteAccountDialogOpen = useUserMenuStore((s) => s.deleteAccountOpen)
  const setDeleteAccountDialogOpen = useUserMenuStore(
    (s) => s.setDeleteAccountOpen,
  )

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCropImage(URL.createObjectURL(file))
    if (avatarInputRef.current) {
      avatarInputRef.current.value = ""
    }
  }

  const handleCrop = async (blob: Blob) => {
    const formData = new FormData()
    formData.append("file", blob, "avatar.png")

    try {
      await tokenHttpClient.post<void>("/api/me/avatar", formData)
      notification.success(
        t("userMenu.avatarUploaded"),
        t("userMenu.avatarUploadedMessage"),
      )
    } catch (err) {
      notification.error(
        t("common.uploadFailed"),
        t("userMenu.avatarUploadFailed", { error: apiErrorMessage(err) }),
      )
    }
    setCropImage(null)
  }

  const copyUid = () => {
    if (!user?.id) return
    navigator.clipboard.writeText(String(user.id))
    notification.success(
      t("userMenu.uidCopied"),
      t("userMenu.uidCopiedMessage", { id: user.id }),
    )
  }

  return (
    <>
      {/* hidden file input */}
      <input
        ref={avatarInputRef}
        id="avatar-input"
        type="file"
        accept="image/*"
        onChange={handleAvatarChange}
        className="sr-only"
      />

      <DropdownMenu open={menuOpen} onOpenChange={(open) => setMenuOpen(open)}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" {...buttonProps}>
            <div className="inline-flex items-center gap-3">
              <Avatar size="lg">
                {user?.avatar_url ? (
                  <AvatarImage
                    src={user.avatar_url}
                    alt={user?.username ?? t("userMenu.avatarAlt")}
                  />
                ) : (
                  <AvatarFallback>{getInitials(user?.username)}</AvatarFallback>
                )}
              </Avatar>
              <div className="flex items-center gap-2">
                <span className="font-medium">{user?.username ?? "—"}</span>
                <span className="text-muted-foreground">
                  {menuOpen ? (
                    <ChevronRight className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                </span>
              </div>
            </div>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-56">
          <div className="px-4 py-3">
            <div className="flex flex-col gap-0">
              <span className="font-semibold">{user?.username ?? "—"}</span>
              <span className="text-sm text-muted-foreground">
                {user?.email ?? "—"}
              </span>
              <button
                type="button"
                onClick={copyUid}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 text-xs font-mono text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-fit"
                title={t("userMenu.copyUidTitle")}
              >
                <Hash className="size-3" />
                <span>UID: {user?.id ?? "—"}</span>
                <Copy className="size-2.5" />
              </button>
            </div>
          </div>

          <div className="px-2 py-2">
            <div className="flex flex-col gap-1">
              <DropdownMenuItem
                onSelect={() => {
                  avatarInputRef.current?.click()
                }}
                className="py-2"
              >
                <span>{t("userMenu.changeAvatar")}</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => setChangeUsernameDialogOpen(true)}
                className="py-2"
              >
                <span>{t("userMenu.changeUsername")}</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => setChangePasswordDialogOpen(true)}
                className="py-2"
              >
                <span>{t("userMenu.changePassword")}</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => setDeleteAccountDialogOpen(true)}
                variant="destructive"
                className="py-2"
              >
                <span className="font-semibold">
                  {t("userMenu.deleteAccount")}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={logout}
                variant="destructive"
                className="py-2"
              >
                <span className="font-semibold">{t("common.logout")}</span>
              </DropdownMenuItem>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangeUsernameDialog
        user={user}
        open={changeUsernameDialogOpen}
        onOpenChange={(open) => setChangeUsernameDialogOpen(open)}
      />

      <ChangePasswordDialog
        open={changePasswordDialogOpen}
        onOpenChange={(open) => setChangePasswordDialogOpen(open)}
      />

      <DeleteAccountDialog
        open={deleteAccountDialogOpen}
        onOpenChange={(open) => setDeleteAccountDialogOpen(open)}
      />

      {cropImage && (
        <AvatarCropDialog
          open={!!cropImage}
          image={cropImage}
          onOpenChange={() => setCropImage(null)}
          onCrop={handleCrop}
        />
      )}
    </>
  )
}

export default UserMenu
