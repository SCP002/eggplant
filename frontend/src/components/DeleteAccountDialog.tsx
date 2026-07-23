import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
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
import { useAuthStore } from "@/hooks/useAuthStore"
import { handleFormError } from "@/lib/handleFormError"
import tokenHttpClient from "@/lib/tokenHttpClient"
import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type DeleteAccountFormInputs = { password: string }

const DeleteAccountDialog = ({ open, onOpenChange }: Props) => {
  const logout = useAuthStore((s) => s.logout)
  const { t } = useTranslation()

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isValid },
  } = useForm<DeleteAccountFormInputs>({
    defaultValues: { password: "" },
    mode: "onChange",
  })

  useEffect(() => {
    if (open) reset({ password: "" })
  }, [open, reset])

  const handleDeleteAccount = async (data: DeleteAccountFormInputs) => {
    const { password } = data
    try {
      await tokenHttpClient.post<void>("/api/me/delete", { password })

      notification.success(
        t("deleteAccount.deleted"),
        t("deleteAccount.deletedMessage"),
      )

      reset()
      onOpenChange(false)
      logout()
    } catch (err) {
      handleFormError(err, setError)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteAccount.title")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleDeleteAccount)}>
          <div className="flex flex-col gap-3 pb-6">
            <div>{t("deleteAccount.warning")}</div>

            <Controller
              name="password"
              control={control}
              rules={{ required: t("auth.passwordRequired") }}
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel>{t("changePassword.current")}</FieldLabel>
                  <FieldContent>
                    <Input
                      autoComplete="current-password"
                      type="password"
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
              <div className="text-destructive">{errors.root.message}</div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              className="mr-3"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </Button>

            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteAccountDialog
