import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import WelcomeHeader from "@/components/WelcomeHeader"
import { useAuthStore } from "@/hooks/useAuthStore"
import { handleFormError } from "@/lib/handleFormError"
import type { LoginFormValues } from "@eggplant/shared/api"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

const LoginForm = () => {
  const login = useAuthStore((s) => s.login)
  const { t } = useTranslation()

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = async (data: LoginFormValues) => {
    try {
      await login(data.email, data.password)
    } catch (err) {
      handleFormError(err, setError)
    }
  }

  return (
    <>
      <WelcomeHeader />

      <h1 className="text-2xl font-semibold text-center">
        {t("auth.loginTitle")}
      </h1>

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
                    errors={fieldState.error ? [fieldState.error] : undefined}
                  />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            name="password"
            control={control}
            rules={{ required: t("auth.passwordRequired") }}
            render={({ field, fieldState }) => (
              <Field data-invalid={!!fieldState.error}>
                <FieldLabel>{t("common.password")}</FieldLabel>
                <FieldContent>
                  <Input
                    className="h-10"
                    type="password"
                    placeholder={t("common.password")}
                    autoComplete="current-password"
                    {...field}
                  />
                  <FieldError
                    errors={fieldState.error ? [fieldState.error] : undefined}
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
            {isSubmitting ? t("auth.loggingIn") : t("common.login")}
          </Button>

          <Button asChild size="lg" variant="outline" className="w-full">
            <Link to="/forgot-password">{t("auth.forgotPassword")}</Link>
          </Button>

          {errors.root && (
            <div className="text-destructive text-sm">
              {errors.root.message}
            </div>
          )}
        </div>
      </form>
    </>
  )
}

export default LoginForm
