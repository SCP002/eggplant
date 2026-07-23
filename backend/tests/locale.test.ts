import { getRequestLocale } from "@/lib/locale"
import { pickTemplates } from "@/lib/mail"
import { describe, expect, it } from "vitest"

describe("getRequestLocale", () => {
  it("prefers X-Locale over Accept-Language", () => {
    const locale = getRequestLocale({
      headers: { "x-locale": "en", "accept-language": "fr" },
    })
    expect(locale).toBe("en")
  })

  it("strips the region from the language tag", () => {
    expect(getRequestLocale({ headers: { "x-locale": "en-US" } })).toBe("en")
  })

  it("falls back to Accept-Language", () => {
    const locale = getRequestLocale({
      headers: { "accept-language": "en-US,en;q=0.9" },
    })
    expect(locale).toBe("en")
  })

  it("uses the first entry of Accept-Language", () => {
    const locale = getRequestLocale({
      headers: { "accept-language": "en,fr;q=0.8" },
    })
    expect(locale).toBe("en")
  })

  it("returns en for unknown locales", () => {
    expect(getRequestLocale({ headers: { "x-locale": "xx" } })).toBe("en")
  })

  it("returns en when no header is present", () => {
    expect(getRequestLocale({ headers: {} })).toBe("en")
  })

  it("returns ru for the ru locale", () => {
    expect(getRequestLocale({ headers: { "x-locale": "ru" } })).toBe("ru")
  })

  it("matches ru from a full Accept-Language header", () => {
    expect(
      getRequestLocale({
        headers: { "accept-language": "ru-RU,ru;q=0.9,en;q=0.8" },
      }),
    ).toBe("ru")
  })

  it("returns zh for the zh locale", () => {
    expect(getRequestLocale({ headers: { "x-locale": "zh" } })).toBe("zh")
  })

  it("matches zh from a full Accept-Language header", () => {
    expect(
      getRequestLocale({
        headers: { "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" },
      }),
    ).toBe("zh")
  })

  it("returns ar for the ar locale", () => {
    expect(getRequestLocale({ headers: { "x-locale": "ar" } })).toBe("ar")
  })

  it("matches ar from a full Accept-Language header", () => {
    expect(
      getRequestLocale({
        headers: { "accept-language": "ar-EG,ar;q=0.9,en;q=0.8" },
      }),
    ).toBe("ar")
  })

  it("handles array header values", () => {
    expect(getRequestLocale({ headers: { "x-locale": ["en", "fr"] } })).toBe(
      "en",
    )
  })
})

describe("pickTemplates", () => {
  it("returns English templates for the en locale", () => {
    const templates = pickTemplates("en")
    expect(templates.codeSubject).toBe("Your verification code for Eggplant")
    expect(templates.resetSubject).toBe("Reset your Eggplant password")
  })

  it("falls back to English for unknown locales", () => {
    const templates = pickTemplates("xx")
    expect(templates.codeSubject).toBe("Your verification code for Eggplant")
  })

  it("returns Russian templates for the ru locale", () => {
    const templates = pickTemplates("ru")
    expect(templates.codeSubject).toBe("Ваш код подтверждения для Eggplant")
    expect(templates.resetSubject).toBe("Сброс пароля Eggplant")
    expect(templates.codePlain("123456")).toContain("123456")
    expect(templates.resetPlain("https://example.com")).toContain(
      "https://example.com",
    )
  })

  it("returns Chinese templates for the zh locale", () => {
    const templates = pickTemplates("zh")
    expect(templates.codeSubject).toBe("您的 Eggplant 验证码")
    expect(templates.resetSubject).toBe("重置您的 Eggplant 密码")
    expect(templates.codePlain("123456")).toContain("123456")
    expect(templates.resetPlain("https://example.com")).toContain(
      "https://example.com",
    )
  })

  it("returns Arabic templates for the ar locale", () => {
    const templates = pickTemplates("ar")
    expect(templates.codeSubject).toBe("رمز التحقق الخاص بك لـ Eggplant")
    expect(templates.resetSubject).toBe("إعادة تعيين كلمة مرور Eggplant")
    expect(templates.codePlain("123456")).toContain("123456")
    expect(templates.resetHtml("https://example.com")).toContain('dir="rtl"')
    expect(templates.resetHtml("https://example.com")).toContain(
      "https://example.com",
    )
  })
})
