import LanguageSwitcher from "@/components/LanguageSwitcher"
import LoginForm from "@/components/LoginForm"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/hooks/useAuthStore"
import { Monitor, Smartphone } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link, Navigate } from "react-router-dom"

const LoginPage = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { t } = useTranslation()
  if (isAuthenticated) return <Navigate to="/" replace />

  return (
    <div className="relative min-h-dvh md:min-h-screen flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="flex flex-col gap-4">
          <LoginForm />
          <Button asChild size="lg" className="w-full">
            <Link to="/register">{t("auth.createAccount")}</Link>
          </Button>

          <div className="w-full border-t pt-4 mt-2">
            <p className="text-sm text-muted-foreground text-center mb-3">
              {t("auth.getNativeApp")}
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href="/downloads/eggplant.apk" download>
                  <Smartphone className="size-4" />
                  {t("common.android")}
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="/downloads/eggplant-setup.exe" download>
                  <Monitor className="size-4" />
                  {t("common.windows")}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
