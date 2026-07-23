import { getEnvVar } from "@/lib/env"
import { SUPPORTED_LOCALES } from "@/lib/locale"
import nodemailer from "nodemailer"

export const SMTP_HOST = getEnvVar("SMTP_HOST")
export const SMTP_PORT = Number(getEnvVar("SMTP_PORT"))
export const SMTP_USER = getEnvVar("SMTP_USER")
export const SMTP_PASSWORD = getEnvVar("SMTP_PASSWORD")

const sharedTransporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
})

export type EmailTemplates = {
  codeSubject: string
  resetSubject: string
  codePlain: (code: string) => string
  resetPlain: (link: string) => string
  codeHtml: (code: string) => string
  resetHtml: (link: string) => string
}

const EN_TEMPLATES: EmailTemplates = {
  codeSubject: "Your verification code for Eggplant",
  resetSubject: "Reset your Eggplant password",
  codePlain: (code) =>
    `Your verification code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can ignore this email.`,
  resetPlain: (link) =>
    `To reset your Eggplant password, click the link below:\n\n${link}\n\nIf you didn't request a password reset, you can ignore this email.`,
  codeHtml: (code) => `
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #eaecef;">
      <h2 style="margin:0 0 8px;color:#2d3748;">Verify your Eggplant account</h2>
      <p style="color:#4a5568;margin-top:0;">Use the code below to complete your registration. It expires in <strong>10 minutes</strong>.</p>
      <div style="margin:24px 0;text-align:center;">
        <div style="display:inline-block;padding:18px 28px;border-radius:8px;background:linear-gradient(90deg,#6b46c1,#805ad5);color:#ffffff;font-size:28px;letter-spacing:4px;font-weight:700;">${code}</div>
      </div>
      <p style="color:#718096;font-size:14px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `,
  resetHtml: (link) => `
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #eaecef;">
      <h2 style="margin:0 0 8px;color:#2d3748;">Reset your Eggplant password</h2>
      <p style="color:#4a5568;margin-top:0;">Click the button below to reset your password. The link expires shortly.</p>
      <div style="margin:24px 0;text-align:center;">
        <a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:linear-gradient(90deg,#6b46c1,#805ad5);color:#ffffff;font-size:16px;text-decoration:none;">Reset password</a>
      </div>
      <p style="color:#718096;font-size:14px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `,
}

const RU_TEMPLATES: EmailTemplates = {
  codeSubject: "Ваш код подтверждения для Eggplant",
  resetSubject: "Сброс пароля Eggplant",
  codePlain: (code) =>
    `Ваш код подтверждения: ${code}\n\nКод действует в течение 10 минут. Если вы не запрашивали этот код, проигнорируйте это письмо.`,
  resetPlain: (link) =>
    `Чтобы сбросить пароль Eggplant, перейдите по ссылке ниже:\n\n${link}\n\nЕсли вы не запрашивали сброс пароля, проигнорируйте это письмо.`,
  codeHtml: (code) => `
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #eaecef;">
      <h2 style="margin:0 0 8px;color:#2d3748;">Подтвердите аккаунт Eggplant</h2>
      <p style="color:#4a5568;margin-top:0;">Используйте код ниже, чтобы завершить регистрацию. Код действует <strong>10 минут</strong>.</p>
      <div style="margin:24px 0;text-align:center;">
        <div style="display:inline-block;padding:18px 28px;border-radius:8px;background:linear-gradient(90deg,#6b46c1,#805ad5);color:#ffffff;font-size:28px;letter-spacing:4px;font-weight:700;">${code}</div>
      </div>
      <p style="color:#718096;font-size:14px;">Если вы не запрашивали этот код, просто проигнорируйте это письмо.</p>
    </div>
  `,
  resetHtml: (link) => `
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #eaecef;">
      <h2 style="margin:0 0 8px;color:#2d3748;">Сброс пароля Eggplant</h2>
      <p style="color:#4a5568;margin-top:0;">Нажмите кнопку ниже, чтобы сбросить пароль. Ссылка действует недолго.</p>
      <div style="margin:24px 0;text-align:center;">
        <a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:linear-gradient(90deg,#6b46c1,#805ad5);color:#ffffff;font-size:16px;text-decoration:none;">Сбросить пароль</a>
      </div>
      <p style="color:#718096;font-size:14px;">Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.</p>
    </div>
  `,
}

const ZH_TEMPLATES: EmailTemplates = {
  codeSubject: "您的 Eggplant 验证码",
  resetSubject: "重置您的 Eggplant 密码",
  codePlain: (code) =>
    `您的验证码是：${code}\n\n此验证码 10 分钟内有效。如果您未请求此验证码，请忽略此邮件。`,
  resetPlain: (link) =>
    `要重置您的 Eggplant 密码，请点击下方链接：\n\n${link}\n\n如果您未请求重置密码，请忽略此邮件。`,
  codeHtml: (code) => `
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #eaecef;">
      <h2 style="margin:0 0 8px;color:#2d3748;">验证您的 Eggplant 账户</h2>
      <p style="color:#4a5568;margin-top:0;">请使用下面的验证码完成注册。验证码在 <strong>10 分钟</strong>内有效。</p>
      <div style="margin:24px 0;text-align:center;">
        <div style="display:inline-block;padding:18px 28px;border-radius:8px;background:linear-gradient(90deg,#6b46c1,#805ad5);color:#ffffff;font-size:28px;letter-spacing:4px;font-weight:700;">${code}</div>
      </div>
      <p style="color:#718096;font-size:14px;">如果您未请求此验证码，请放心忽略此邮件。</p>
    </div>
  `,
  resetHtml: (link) => `
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #eaecef;">
      <h2 style="margin:0 0 8px;color:#2d3748;">重置您的 Eggplant 密码</h2>
      <p style="color:#4a5568;margin-top:0;">点击下方按钮以重置密码。链接有效期很短。</p>
      <div style="margin:24px 0;text-align:center;">
        <a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:linear-gradient(90deg,#6b46c1,#805ad5);color:#ffffff;font-size:16px;text-decoration:none;">重置密码</a>
      </div>
      <p style="color:#718096;font-size:14px;">如果您未请求重置密码，请放心忽略此邮件。</p>
    </div>
  `,
}

const AR_TEMPLATES: EmailTemplates = {
  codeSubject: "رمز التحقق الخاص بك لـ Eggplant",
  resetSubject: "إعادة تعيين كلمة مرور Eggplant",
  codePlain: (code) =>
    `رمز التحقق الخاص بك هو: ${code}\n\nهذا الرمز صالح لمدة 10 دقائق. إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة.`,
  resetPlain: (link) =>
    `لإعادة تعيين كلمة مرور Eggplant، انقر على الرابط أدناه:\n\n${link}\n\nإذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.`,
  codeHtml: (code) => `
    <div dir="rtl" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #eaecef;">
      <h2 style="margin:0 0 8px;color:#2d3748;">تحقق من حساب Eggplant الخاص بك</h2>
      <p style="color:#4a5568;margin-top:0;">استخدم الرمز أدناه لإكمال التسجيل. الرمز صالح لمدة <strong>10 دقائق</strong>.</p>
      <div style="margin:24px 0;text-align:center;">
        <div style="display:inline-block;padding:18px 28px;border-radius:8px;background:linear-gradient(90deg,#6b46c1,#805ad5);color:#ffffff;font-size:28px;letter-spacing:4px;font-weight:700;">${code}</div>
      </div>
      <p style="color:#718096;font-size:14px;">إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان.</p>
    </div>
  `,
  resetHtml: (link) => `
    <div dir="rtl" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #eaecef;">
      <h2 style="margin:0 0 8px;color:#2d3748;">إعادة تعيين كلمة مرور Eggplant</h2>
      <p style="color:#4a5568;margin-top:0;">انقر على الزر أدناه لإعادة تعيين كلمة المرور. الرابط صالح لفترة قصيرة.</p>
      <div style="margin:24px 0;text-align:center;">
        <a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:linear-gradient(90deg,#6b46c1,#805ad5);color:#ffffff;font-size:16px;text-decoration:none;">إعادة تعيين كلمة المرور</a>
      </div>
      <p style="color:#718096;font-size:14px;">إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة بأمان.</p>
    </div>
  `,
}

const TEMPLATES: Record<string, EmailTemplates> = {
  en: EN_TEMPLATES,
  ru: RU_TEMPLATES,
  zh: ZH_TEMPLATES,
  ar: AR_TEMPLATES,
}

const EMAIL_STYLE = (inner: string): string => `
    <html>
      <body style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;background:#f6f8fa;padding:20px;">
        ${inner}
        <hr style="border:none;border-top:1px solid #e6e6e6;margin:18px 0;">
        <p style="font-size:12px;color:#a0aec0;margin:0;">Eggplant • Secure verification</p>
      </body>
    </html>
`

async function sendEmail(
  toEmail: string,
  subject: string,
  plainContent: string,
  htmlContent: string,
): Promise<void> {
  await sharedTransporter.sendMail({
    from: SMTP_USER,
    to: toEmail,
    subject,
    text: plainContent,
    html: htmlContent,
  })
}

export function pickTemplates(locale: string): EmailTemplates {
  return TEMPLATES[locale] ?? EN_TEMPLATES
}

export async function sendEmailCode(
  toEmail: string,
  code: string,
  locale = "en",
): Promise<void> {
  const templates = pickTemplates(locale)
  await sendEmail(
    toEmail,
    templates.codeSubject,
    templates.codePlain(code),
    EMAIL_STYLE(templates.codeHtml(code)),
  )
}

export async function sendPasswordReset(
  toEmail: string,
  resetLink: string,
  locale = "en",
): Promise<void> {
  const templates = pickTemplates(locale)
  await sendEmail(
    toEmail,
    templates.resetSubject,
    templates.resetPlain(resetLink),
    EMAIL_STYLE(templates.resetHtml(resetLink)),
  )
}

export { SUPPORTED_LOCALES }
