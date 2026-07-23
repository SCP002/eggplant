import { useTranslation } from "react-i18next"

const WelcomeHeader = () => {
  const { t } = useTranslation()

  return (
    <div className="text-center">
      <h1 className="text-2xl font-semibold mb-2">
        {t("welcome.title")} <span aria-hidden>🍆</span>
      </h1>
      <p className="text-gray-500 mb-6">{t("welcome.subtitle")}</p>
    </div>
  )
}

export default WelcomeHeader
