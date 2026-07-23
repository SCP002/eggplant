import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { notification } from "@/context/notificationHistoryStore"
import { handleFormError } from "@/lib/handleFormError"
import tokenHttpClient from "@/lib/tokenHttpClient"
import type { ChangePasswordFormValues } from "@eggplant/shared/api"
import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ChangePasswordDialog = ({ open, onOpenChange }: Props) => {
  const { t } = useTranslation()

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isValid },
  } = useForm<ChangePasswordFormValues>({
    defaultValues: { old_password: "", new_password: "" },
    mode: "onChange",
  })

  useEffect(() => {
    if (open) {
      reset({ old_password: "", new_password: "" })
    }
  }, [open, reset])

  const handleChangePassword = async (data: ChangePasswordFormValues) => {
    const { old_password, new_password } = data
    try {
      await tokenHttpClient.post<void>("/api/me/password", {
        old_password,
        new_password,
      })

      notification.success(
        t("changePassword.changed"),
        t("changePassword.changedMessage"),
      )

      reset()
      onOpenChange(false)
    } catch (err) {
      handleFormError(err, setError)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("changePassword.title")}</DialogTitle>
          <DialogDescription>
            {t("changePassword.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleChangePassword)}>
          <input
            type="text"
            className="sr-only"
            autoComplete="username"
            name="username"
          />

          <div className="flex flex-col gap-3 pb-6">
            <Controller
              name="old_password"
              control={control}
              rules={{ required: t("changePassword.currentRequired") }}
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel>{t("changePassword.current")}</FieldLabel>
                  <FieldContent>
                    <Input
                      className="h-9"
                      type="password"
                      placeholder={t("changePassword.current")}
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

            <Controller
              name="new_password"
              control={control}
              rules={{
                required: t("auth.newPasswordRequired"),
                minLength: {
                  value: 8,
                  message: t("changePassword.minLength"),
                },
              }}
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel>{t("auth.newPassword")}</FieldLabel>
                  <FieldContent>
                    <Input
                      className="h-9"
                      type="password"
                      placeholder={t("auth.newPassword")}
                      autoComplete="new-password"
                      {...field}
                    />
                    <FieldError
                      errors={fieldState.error ? [fieldState.error] : undefined}
                    />
                  </FieldContent>
                </Field>
              )}
            />

            {errors.root && (
              <div className="text-destructive text-sm">
                {errors.root.message}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </Button>

            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default ChangePasswordDialog
