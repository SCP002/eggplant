import { useTheme } from "@/components/theme-provider"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { SUPPORTED_LANGUAGES } from "@/i18n"
import { cn } from "@/lib/utils"
import {
  Check,
  Download,
  Languages,
  Monitor,
  Moon,
  Paintbrush,
  Smartphone,
  Sun,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type CategoryId = "appearance" | "language" | "downloads"

type ThemeValue = "light" | "dark" | "system"

const CATEGORIES = [
  {
    id: "appearance",
    labelKey: "settings.categories.appearance",
    icon: Paintbrush,
  },
  { id: "language", labelKey: "settings.categories.language", icon: Languages },
  {
    id: "downloads",
    labelKey: "settings.categories.downloads",
    icon: Download,
  },
] as const satisfies {
  id: CategoryId
  labelKey: string
  icon: typeof Paintbrush
}[]

const THEME_OPTIONS = [
  { value: "light", labelKey: "settings.theme.light", icon: Sun },
  { value: "dark", labelKey: "settings.theme.dark", icon: Moon },
  { value: "system", labelKey: "settings.theme.system", icon: Monitor },
] as const satisfies {
  value: ThemeValue
  labelKey: string
  icon: typeof Sun
}[]

const DOWNLOADS = [
  {
    href: "/downloads/eggplant.apk",
    labelKey: "common.android",
    icon: Smartphone,
  },
  {
    href: "/downloads/eggplant-setup.exe",
    labelKey: "common.windows",
    icon: Monitor,
  },
] as const satisfies {
  href: string
  labelKey: string
  icon: typeof Smartphone
}[]

const itemClass =
  "flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/50"

const SettingsDialog = ({ open, onOpenChange }: Props) => {
  const { theme, setTheme } = useTheme()
  const { i18n, t } = useTranslation()
  const [category, setCategory] = useState<CategoryId>("appearance")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 md:flex-row">
          <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto md:w-44 md:flex-col">
            {CATEGORIES.map((categoryItem) => {
              const Icon = categoryItem.icon
              const active = category === categoryItem.id
              return (
                <button
                  key={categoryItem.id}
                  type="button"
                  onClick={() => setCategory(categoryItem.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {t(categoryItem.labelKey)}
                </button>
              )
            })}
          </nav>

          <Separator className="md:hidden" />

          <div className="min-w-0 flex-1">
            {category === "appearance" && (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  {t("settings.theme.title")}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t("settings.theme.description")}
                </span>
                <div className="mt-2 flex flex-col gap-1">
                  {THEME_OPTIONS.map((option) => {
                    const Icon = option.icon
                    const selected = theme === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTheme(option.value)}
                        className={cn(
                          itemClass,
                          "justify-between",
                          selected
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="size-4" />
                          {t(option.labelKey)}
                        </span>
                        {selected && <Check className="size-4 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {category === "language" && (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  {t("settings.language.title")}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t("settings.language.description")}
                </span>
                <div className="mt-2 flex flex-col gap-1">
                  {SUPPORTED_LANGUAGES.map((language) => {
                    const selected = i18n.resolvedLanguage === language.code
                    return (
                      <button
                        key={language.code}
                        type="button"
                        onClick={() => void i18n.changeLanguage(language.code)}
                        className={cn(
                          itemClass,
                          "justify-between",
                          selected
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Languages className="size-4" />
                          {t(language.labelKey)}
                        </span>
                        {selected && <Check className="size-4 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {category === "downloads" && (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  {t("settings.downloads.title")}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t("settings.downloads.description")}
                </span>
                <div className="mt-2 flex flex-col gap-1">
                  {DOWNLOADS.map((download) => {
                    const Icon = download.icon
                    return (
                      <a
                        key={download.href}
                        href={download.href}
                        download
                        className={itemClass}
                      >
                        <Icon className="size-4" />
                        {t(download.labelKey)}
                      </a>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SettingsDialog
