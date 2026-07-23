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
import { handleFormError } from "@/lib/handleFormError"
import tokenHttpClient from "@/lib/tokenHttpClient"
import type { ChangeUsernameFormValues, User } from "@eggplant/shared/api"
import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

type Props = {
  user: User | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ChangeUsernameDialog = ({ user, open, onOpenChange }: Props) => {
  const { t } = useTranslation()

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isValid },
  } = useForm<ChangeUsernameFormValues>({
    defaultValues: { username: user?.username ?? "" },
    mode: "onChange",
  })

  useEffect(() => {
    if (open) {
      reset({ username: user?.username ?? "" })
    }
  }, [open, user, reset])

  const handleSaveUsername = async (data: ChangeUsernameFormValues) => {
    const username = data.username
    if (!username) return

    try {
      await tokenHttpClient.post<void>("/api/me/username", { username })

      reset({ username })
      onOpenChange(false)
    } catch (err) {
      handleFormError(err, setError)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("changeUsername.title")}</DialogTitle>
          <DialogDescription>
            {t("changeUsername.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleSaveUsername)}>
          <div className="flex flex-col gap-3 pb-6">
            <Controller
              name="username"
              control={control}
              rules={{
                required: t("auth.usernameRequired"),
                minLength: {
                  value: 3,
                  message: t("changeUsername.minLength"),
                },
                maxLength: {
                  value: 20,
                  message: t("changeUsername.maxLength"),
                },
              }}
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel>{t("common.username")}</FieldLabel>
                  <FieldContent>
                    <Input
                      className="h-9"
                      placeholder={t("common.username")}
                      autoComplete="username"
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

export default ChangeUsernameDialog
