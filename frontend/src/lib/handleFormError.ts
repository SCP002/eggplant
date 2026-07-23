import { apiErrorMessage } from "@/lib/apiErrorMessage"
import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form"

export function handleFormError<TFormValues extends FieldValues = FieldValues>(
  err: unknown,
  setError: UseFormSetError<TFormValues>,
) {
  const rootName = "root" as unknown as FieldPath<TFormValues>
  setError(rootName, { type: "server", message: apiErrorMessage(err) })
}
