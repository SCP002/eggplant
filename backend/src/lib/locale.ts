import Negotiator from "negotiator"

export const SUPPORTED_LOCALES = ["en", "ru", "zh", "ar"]

export function getRequestLocale(request: {
  headers: Record<string, string | string[] | undefined>
}): string {
  const header =
    request.headers["x-locale"] ?? request.headers["accept-language"]
  const value = Array.isArray(header) ? header[0] : header
  return (
    new Negotiator({ headers: { "accept-language": value } }).language(
      SUPPORTED_LOCALES,
    ) ?? "en"
  )
}
