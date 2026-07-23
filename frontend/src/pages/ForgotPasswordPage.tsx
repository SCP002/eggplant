import LanguageSwitcher from "@/components/LanguageSwitcher"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import WelcomeHeader from "@/components/WelcomeHeader"
import { useForgotPasswordStore } from "@/context/forgotPasswordStore"
import { apiErrorMessage } from "@/lib/apiErrorMessage"
import type { PasswordResetSendFormValues } from "@eggplant/shared/api"
import axios from "axios"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

const ForgotPasswordPage = () => {
  const { t } = useTranslation()

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordResetSendFormValues>({ defaultValues: { email: "" } })

  const submitted = useForgotPasswordStore((s) => s.submitted)
  const setSubmitted = useForgotPasswordStore((s) => s.setSubmitted)

  const onSubmit = async (data: PasswordResetSendFormValues) => {
    try {
      const formData = new URLSearchParams()
      formData.append("email", data.email)

      await axios.post<void>("/auth/password_reset/send", formData)

      setSubmitted(true)
    } catch (err) {
      setError("root", { type: "server", message: apiErrorMessage(err) })
    }
  }

  return (
    <div className="relative min-h-dvh md:min-h-screen flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="flex flex-col gap-4">
          <WelcomeHeader />

          <h1 className="text-2xl font-semibold text-center mb-6">
            {t("auth.forgotPasswordTitle")}
          </h1>

          {submitted ? (
            <div className="text-sm">{t("auth.resetLinkSent")}</div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="w-full">
              <div className="flex flex-col gap-4">
                <Controller
                  name="email"
                  control={control}
                  rules={{ required: t("auth.emailRequired") }}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={!!fieldState.error}>
                      <FieldLabel>{t("common.email")}</FieldLabel>
                      <FieldContent>
                        <Input
                          className="h-10"
                          type="email"
                          placeholder={t("common.email")}
                          autoComplete="email"
                          {...field}
                        />
                        <FieldError
                          errors={
                            fieldState.error ? [fieldState.error] : undefined
                          }
                        />
                      </FieldContent>
                    </Field>
                  )}
                />

                <Button
                  size="lg"
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? t("auth.sending") : t("auth.sendResetLink")}
                </Button>

                <Button asChild size="lg" variant="outline" className="w-full">
                  <Link to="/login">{t("auth.backToLogin")}</Link>
                </Button>

                {errors.root && (
                  <div className="text-destructive text-sm">
                    {errors.root.message}
                  </div>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default ForgotPasswordPage
