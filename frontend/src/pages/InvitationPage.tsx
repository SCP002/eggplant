import LanguageSwitcher from "@/components/LanguageSwitcher"
import { Button } from "@/components/ui/button"
import { useMainPageStore } from "@/context/mainPageStore"
import {
  notification,
  useNotificationHistoryStore,
} from "@/context/notificationHistoryStore"
import { apiErrorMessage } from "@/lib/apiErrorMessage"
import { roomDisplayName } from "@/lib/roomName"
import tokenHttpClient from "@/lib/tokenHttpClient"
import type { RoomResp } from "@eggplant/shared/api"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Navigate, useNavigate, useParams } from "react-router-dom"

const InvitationPage = () => {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()
  const [status, setStatus] = useState<"loading" | "error" | "accepted">(
    "loading",
  )
  const [errorMsg, setErrorMsg] = useState("")
  const setRoom = useMainPageStore((s) => s.setRoom)
  const dismissByActionToken = useNotificationHistoryStore(
    (s) => s.dismissByActionToken,
  )
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) return
    const accept = async () => {
      try {
        const res = await tokenHttpClient.post<RoomResp>(
          `/api/invitations/${token}/accept`,
        )
        setRoom(res.data)
        setStatus("accepted")
        dismissByActionToken(token)
        notification.success(
          t("invitation.joinedRoom"),
          t("invitation.joinedRoomMessage", {
            roomName: roomDisplayName(res.data, t),
          }),
        )
        setTimeout(() => {
          navigate(`/rooms/${res.data.id}`, { replace: true })
        }, 1500)
      } catch (err) {
        setStatus("error")
        setErrorMsg(apiErrorMessage(err))
      }
    }
    accept()
  }, [token, setRoom, navigate, dismissByActionToken, t])

  if (!token) return <Navigate to="/" replace />

  return (
    <div className="relative flex h-dvh md:h-screen items-center justify-center">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="text-center space-y-4">
        {status === "loading" && (
          <p className="text-lg">{t("invitation.accepting")}</p>
        )}
        {status === "error" && (
          <>
            <p className="text-lg text-destructive">
              {t("invitation.acceptFailed")}
            </p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button onClick={() => navigate("/")}>
              {t("invitation.goHome")}
            </Button>
          </>
        )}
        {status === "accepted" && (
          <p className="text-lg text-green-600">{t("invitation.accepted")}</p>
        )}
      </div>
    </div>
  )
}

export default InvitationPage
