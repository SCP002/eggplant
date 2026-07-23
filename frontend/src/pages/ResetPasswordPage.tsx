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
import { useResetPasswordStore } from "@/context/resetPasswordStore"
import { apiErrorMessage } from "@/lib/apiErrorMessage"
import type { PasswordResetConfirmFormValues } from "@eggplant/shared/api"
import axios from "axios"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router-dom"

type FormValues = Omit<PasswordResetConfirmFormValues, "token"> & {
  confirm_password: string
}

const ResetPasswordPage = () => {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")

  const {
    control,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { new_password: "", confirm_password: "" },
  })

  const success = useResetPasswordStore((s) => s.success)
  const setSuccess = useResetPasswordStore((s) => s.setSuccess)

  const onSubmit = async (data: FormValues) => {
    if (!token) {
      setError("root", {
        type: "server",
        message: t("auth.missingResetToken"),
      })
      return
    }

    try {
      const formData = new URLSearchParams()
      formData.append("new_password", data.new_password)
      formData.append("token", token)
      await axios.post<void>(`/auth/password_reset/confirm`, formData)

      setSuccess(true)
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
            {t("auth.resetPasswordTitle")}
          </h1>

          {!token ? (
            <div className="text-destructive text-center">
              {t("auth.invalidResetToken")}
            </div>
          ) : success ? (
            <div className="w-full">
              <div className="mb-4">{t("auth.passwordResetSuccess")}</div>

              <Button asChild size="lg" variant="outline" className="w-full">
                <Link to="/login">{t("auth.goToLogin")}</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="w-full">
              <div className="flex flex-col gap-4">
                <Controller
                  name="new_password"
                  control={control}
                  rules={{
                    required: t("auth.newPasswordRequired"),
                    minLength: {
                      value: 8,
                      message: t("auth.passwordMinLength"),
                    },
                  }}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={!!fieldState.error}>
                      <FieldLabel>{t("auth.newPassword")}</FieldLabel>
                      <FieldContent>
                        <Input
                          autoComplete="new-password"
                          type="password"
                          placeholder={t("auth.newPassword")}
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

                <Controller
                  name="confirm_password"
                  control={control}
                  rules={{
                    required: t("auth.confirmPasswordRequired"),
                    validate: (v) =>
                      v === getValues("new_password") ||
                      t("auth.passwordsDoNotMatch"),
                  }}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={!!fieldState.error}>
                      <FieldLabel>{t("auth.confirmNewPassword")}</FieldLabel>
                      <FieldContent>
                        <Input
                          autoComplete="new-password"
                          type="password"
                          placeholder={t("auth.confirmNewPassword")}
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
                  {isSubmitting
                    ? t("auth.resetting")
                    : t("auth.resetPasswordButton")}
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

export default ResetPasswordPage
