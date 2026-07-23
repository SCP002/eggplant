import i18n from "@/i18n"
import type { ApiError } from "@eggplant/shared/api"
import type { AxiosError } from "axios"

export function apiErrorMessage(err: unknown): string {
  const data = (err as AxiosError<ApiError> | undefined)?.response?.data
  const code = data?.code
  if (code) {
    return i18n.t(`errors.${code}` as never, {
      defaultValue: i18n.t("errors.generic"),
      ...(data.params ?? {}),
    })
  }
  return i18n.t("errors.generic")
}
