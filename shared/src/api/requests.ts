import { z } from "zod"

const usernameFormSchema = z
  .string()
  .refine((v) => v === v.trim(), {
    message: "Username must not start or end with whitespace",
  })
  .refine((v) => v.trim().length >= 3 && v.trim().length <= 20, {
    message: "Username must be between 3 and 20 characters",
  })

const roomNameFormSchema = z.string().refine(
  (v) => {
    const trimmed = v.trim()
    return trimmed.length >= 1 && trimmed.length <= 50
  },
  { message: "Room name must be between 1 and 50 characters" },
)

export const changeUsernameFormSchema = z.object({
  username: usernameFormSchema,
})

export const changePasswordFormSchema = z.object({
  old_password: z.string(),
  new_password: z.string().min(8).max(128),
})

export const loginFormSchema = z.object({
  email: z.string(),
  password: z.string(),
})

export const registerSendCodeFormSchema = z.object({
  email: z.string().email(),
  username: usernameFormSchema,
  password: z.string().min(8).max(128),
})

export const registerVerifyFormSchema = z.object({
  email: z.string().min(1),
  code: z.string().min(1),
})

export const passwordResetSendFormSchema = z.object({
  email: z.string().min(1),
})

export const passwordResetConfirmFormSchema = z.object({
  new_password: z.string().min(8).max(128),
  token: z.string().min(1),
})

export const createRoomFormSchema = z.object({
  name: roomNameFormSchema,
})

export const updateRoomFormSchema = z.object({
  name: roomNameFormSchema.nullable().optional(),
})

export const changeMemberRoleFormSchema = z.object({
  role: z.enum(["owner", "admin", "member", "guest"]),
})

export const createInvitationFormSchema = z.object({
  invitee_id: z.number().int().positive().nullable().optional(),
})

// Frontend-facing inferred form values (single source of truth for the web client)
export type LoginFormValues = z.infer<typeof loginFormSchema>
export type ChangeUsernameFormValues = z.infer<typeof changeUsernameFormSchema>
export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>
export type RegisterSendCodeFormValues = z.infer<
  typeof registerSendCodeFormSchema
>
export type PasswordResetSendFormValues = z.infer<
  typeof passwordResetSendFormSchema
>
export type PasswordResetConfirmFormValues = z.infer<
  typeof passwordResetConfirmFormSchema
>
