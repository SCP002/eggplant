import ar from "@/i18n/locales/ar.json"
import en from "@/i18n/locales/en.json"
import ru from "@/i18n/locales/ru.json"
import zh from "@/i18n/locales/zh.json"
import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

export const LANGUAGE_STORAGE_KEY = "eggplant-language"

export const resources = {
  en: { translation: en },
  ru: { translation: ru },
  zh: { translation: zh },
  ar: { translation: ar },
} as const

export const SUPPORTED_LANGUAGES = [
  { code: "en", labelKey: "languages.english" },
  { code: "ru", labelKey: "languages.russian" },
  { code: "zh", labelKey: "languages.chinese" },
  { code: "ar", labelKey: "languages.arabic" },
] as const

const applyDocumentLanguage = (lng: string) => {
  document.documentElement.lang = lng
  document.documentElement.dir = i18n.dir(lng)
}

const syncTrayLabels = () => {
  window.electronAPI?.setTrayLabels?.({
    show: i18n.t("tray.show"),
    quit: i18n.t("tray.quit"),
  })
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: ["en", "ru", "zh", "ar"],
    fallbackLng: "en",
    load: "languageOnly",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
  })

i18n.on("languageChanged", applyDocumentLanguage)
i18n.on("languageChanged", syncTrayLabels)
applyDocumentLanguage(i18n.resolvedLanguage ?? "en")
syncTrayLabels()

export default i18n
