import type { i18nProps } from "@platejs/emoji"
import type { TFunction } from "i18next"

export function emojiPickerI18n(t: TFunction): i18nProps {
  return {
    categories: {
      activity: t("emojiPicker.categories.activity"),
      custom: t("emojiPicker.categories.custom"),
      flags: t("emojiPicker.categories.flags"),
      foods: t("emojiPicker.categories.foods"),
      frequent: t("emojiPicker.categories.frequent"),
      nature: t("emojiPicker.categories.nature"),
      objects: t("emojiPicker.categories.objects"),
      people: t("emojiPicker.categories.people"),
      places: t("emojiPicker.categories.places"),
      symbols: t("emojiPicker.categories.symbols"),
    },
    clear: t("emojiPicker.clear"),
    pick: t("emojiPicker.pick"),
    search: t("emojiPicker.search"),
    searchNoResultsSubtitle: t("emojiPicker.searchNoResultsSubtitle"),
    searchNoResultsTitle: t("emojiPicker.searchNoResultsTitle"),
    searchResult: t("emojiPicker.searchResult"),
    skins: {
      "1": t("emojiPicker.skins.default"),
      "2": t("emojiPicker.skins.light"),
      "3": t("emojiPicker.skins.mediumLight"),
      "4": t("emojiPicker.skins.medium"),
      "5": t("emojiPicker.skins.mediumDark"),
      "6": t("emojiPicker.skins.dark"),
      choose: t("emojiPicker.skins.choose"),
    },
  }
}

const FRIMOUSSE_CATEGORY_LABEL_KEY: Record<string, string> = {
  "smileys & emotion": "emojiPicker.categories.people",
  "people & body": "emojiPicker.categories.peopleBody",
  "animals & nature": "emojiPicker.categories.nature",
  "food & drink": "emojiPicker.categories.foods",
  "travel & places": "emojiPicker.categories.places",
  activities: "emojiPicker.categories.activity",
  objects: "emojiPicker.categories.objects",
  symbols: "emojiPicker.categories.symbols",
  flags: "emojiPicker.categories.flags",
}

export function frimousseCategoryLabel(label: string, t: TFunction): string {
  const key = FRIMOUSSE_CATEGORY_LABEL_KEY[label.toLowerCase()]
  return key ? t(key as never) : label
}
