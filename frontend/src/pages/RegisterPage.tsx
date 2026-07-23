import LanguageSwitcher from "@/components/LanguageSwitcher"
import RegisterForm from "@/components/RegisterForm"
import { Button } from "@/components/ui/button"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

const RegisterPage = () => {
  const { t } = useTranslation()

  return (
    <div className="relative min-h-dvh md:min-h-screen flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="flex flex-col gap-4">
          <RegisterForm />

          <Button asChild size="lg" variant="outline" className="w-full">
            <Link to="/login">{t("auth.backToLogin")}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
