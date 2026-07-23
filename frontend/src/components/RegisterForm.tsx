import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import WelcomeHeader from "@/components/WelcomeHeader"
import { useAuthStore } from "@/hooks/useAuthStore"
import { useRegisterStore } from "@/hooks/useRegisterStore"
import { handleFormError } from "@/lib/handleFormError"
import type { RegisterSendCodeFormValues } from "@eggplant/shared/api"
import axios from "axios"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useCountdown } from "usehooks-ts"

type RegisterFormInputs = RegisterSendCodeFormValues & {
  confirm_password: string
  code?: string
}

const RegisterForm = () => {
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const { t } = useTranslation()

  const {
    control,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isValid },
  } = useForm<RegisterFormInputs>({
    defaultValues: {
      email: "",
      password: "",
      confirm_password: "",
      username: "",
      code: "",
    },
    mode: "onChange",
  })

  const codeSent = useRegisterStore((s) => s.codeSent)
  const sending = useRegisterStore((s) => s.sending)
  const verifying = useRegisterStore((s) => s.verifying)

  const setCodeSent = useRegisterStore((s) => s.setCodeSent)
  const setSending = useRegisterStore((s) => s.setSending)
  const setVerifying = useRegisterStore((s) => s.setVerifying)

  const [count, { startCountdown, resetCountdown }] = useCountdown({
    countStart: 60,
    intervalMs: 1000,
  })

  const secondsLeft = codeSent ? count : 0

  const sendCode = async (data: RegisterFormInputs) => {
    setSending(true)
    try {
      const formData = new URLSearchParams()
      formData.append("email", data.email)
      formData.append("password", data.password)
      formData.append("username", data.username)

      await axios.post<void>("/auth/register/send_code", formData)

      setCodeSent(true)
      resetCountdown()
      startCountdown()
    } catch (err) {
      handleFormError(err, setError)
    } finally {
      setSending(false)
    }
  }

  const verifyCode = async (data: RegisterFormInputs) => {
    setVerifying(true)
    try {
      const formData = new URLSearchParams()
      formData.append("email", data.email)
      formData.append("code", data.code ?? "")

      await axios.post<void>("/auth/register/verify", formData)

      login(data.email, data.password)
      navigate("/")
    } catch (err) {
      handleFormError(err, setError)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <>
      <WelcomeHeader />

      <h1 className="text-2xl font-semibold text-center">
        {t("auth.registerTitle")}
      </h1>

      <form className="w-full" onSubmit={handleSubmit(() => {})}>
        <div className="flex flex-col gap-4">
          <Controller
            name="username"
            control={control}
            rules={{ required: t("auth.usernameRequired") }}
            render={({ field, fieldState }) => (
              <Field data-invalid={!!fieldState.error}>
                <FieldLabel>{t("common.username")}</FieldLabel>
                <FieldContent>
                  <Input
                    className="h-10"
                    placeholder={t("common.username")}
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
            name="email"
            control={control}
            rules={{ required: t("auth.emailRequired") }}
            render={({ field, fieldState }) => (
              <Field data-invalid={!!fieldState.error}>
                <FieldLabel>{t("common.email")}</FieldLabel>
                <FieldContent>
                  <Input
                    className="h-10"
                    autoComplete="email"
                    type="email"
                    placeholder={t("common.email")}
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
                    autoComplete="new-password"
                    type="password"
                    placeholder={t("common.password")}
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
            name="confirm_password"
            control={control}
            rules={{
              required: t("auth.confirmPasswordRequired"),
              validate: (v) =>
                v === getValues("password") || t("auth.passwordsDoNotMatch"),
            }}
            render={({ field, fieldState }) => (
              <Field data-invalid={!!fieldState.error}>
                <FieldLabel>{t("common.confirmPassword")}</FieldLabel>
                <FieldContent>
                  <Input
                    className="h-10"
                    autoComplete="new-password"
                    type="password"
                    placeholder={t("auth.confirmPasswordPlaceholder")}
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
            type="button"
            size="lg"
            className="w-full"
            disabled={sending || secondsLeft > 0}
            onClick={() => {
              handleSubmit(sendCode)()
            }}
          >
            {secondsLeft > 0
              ? t("auth.resendIn", { seconds: secondsLeft })
              : codeSent
                ? t("auth.resendVerificationCode")
                : t("auth.sendVerificationCode")}
          </Button>

          {codeSent && (
            <>
              <Controller
                name="code"
                control={control}
                rules={{
                  required: t("auth.verificationCodeRequired"),
                  pattern: {
                    value: /^\d{6}$/,
                    message: t("auth.codeMustBe6Digits"),
                  },
                }}
                render={({ field, fieldState }) => (
                  <Field data-invalid={!!fieldState.error}>
                    <FieldLabel>{t("auth.verificationCode")}</FieldLabel>
                    <FieldContent>
                      <Input
                        className="h-10"
                        placeholder={t("auth.enter6DigitCode")}
                        maxLength={6}
                        autoFocus
                        {...field}
                      />
                      <FieldError
                        errors={
                          fieldState.error ? [fieldState.error] : undefined
                        }
                      />
                      <FieldDescription>
                        {t("auth.verificationCodeHint")}
                      </FieldDescription>

                      {isValid && (
                        <Button
                          type="button"
                          size="lg"
                          className="w-full mt-3"
                          onClick={handleSubmit(verifyCode)}
                        >
                          {verifying
                            ? t("auth.verifying")
                            : t("auth.submitCode")}
                        </Button>
                      )}
                    </FieldContent>
                  </Field>
                )}
              />
            </>
          )}

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

export default RegisterForm
