import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

export const roomRoleEnum = pgEnum("room_role", [
  "owner",
  "admin",
  "member",
  "guest",
])
export const roomMembershipStatusEnum = pgEnum("room_membership_status", [
  "active",
  "pending",
  "banned",
])
export const aiModificationPresetEnum = pgEnum("ai_modification_preset", [
  "none",
  "pirate",
])
export const registrationRuleEnum = pgEnum("registration_rule", [
  "allow",
  "deny",
])

export const users = pgTable(
  "users",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    email: varchar("email").notNull().unique(),
    hashed_password: varchar("hashed_password").notNull(),
    username: varchar("username").notNull().unique(),
    avatar_url: varchar("avatar_url"),
  },
  (t) => [
    index("ix_users_id").on(t.id),
    index("ix_users_email").on(t.email),
    index("ix_users_username").on(t.username),
  ],
)

export const adminUsers = pgTable("admin_users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  username: varchar("username").notNull().unique(),
  hashed_password: varchar("hashed_password").notNull(),
})

export const registrationRules = pgTable(
  "registration_rules",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    email: varchar("email").notNull().unique(),
    action: registrationRuleEnum("action").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ix_registration_rules_id").on(t.id)],
)

export const verificationCodes = pgTable(
  "verification_codes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    email: varchar("email").notNull(),
    username: varchar("username").notNull(),
    hashed_password: varchar("hashed_password").notNull(),
    code: varchar("code").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ix_verification_codes_id").on(t.id),
    index("ix_verification_codes_email").on(t.email),
  ],
)

export const rooms = pgTable(
  "rooms",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: varchar("name").notNull(),
    is_private: boolean("is_private").notNull().default(true),
    is_general: boolean("is_general").notNull().default(false),
    owner_id: integer("owner_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    avatar_url: varchar("avatar_url"),
    dm_user_low_id: integer("dm_user_low_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    dm_user_high_id: integer("dm_user_high_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .$defaultFn(() => ({})),
  },
  (t) => [
    index("ix_rooms_id").on(t.id),
    uniqueIndex("uq_rooms_is_general_true")
      .on(t.is_general)
      .where(sql`is_general`),
    uniqueIndex("uq_rooms_dm_pair").on(t.dm_user_low_id, t.dm_user_high_id),
  ],
)

export const roomMembers = pgTable(
  "room_members",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    room_id: integer("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roomRoleEnum("role").notNull().default("member"),
    status: roomMembershipStatusEnum("status").notNull().default("active"),
    hidden: boolean("hidden").notNull().default(false),
    joined_at: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    last_read_message_id: integer("last_read_message_id"),
  },
  (t) => [uniqueIndex("uq_room_members_room_user").on(t.room_id, t.user_id)],
)

export const roomMessages = pgTable(
  "room_messages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    room_id: integer("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    sender_id: integer("sender_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    parent_id: integer("parent_id").references(
      (): AnyPgColumn => roomMessages.id,
      { onDelete: "set null" },
    ),
    text: text("text").notNull(),
    system_user_id: integer("system_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    edited_at: timestamp("edited_at", { withTimezone: true }),
    deleted: boolean("deleted").notNull().default(false),
    ai_modification_preset: aiModificationPresetEnum("ai_modification_preset")
      .notNull()
      .default("none"),
    file_ids: jsonb("file_ids").$type<string[]>(),
  },
  (t) => [index("ix_room_messages_id").on(t.id)],
)

export const fileAttachments = pgTable(
  "file_attachments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    basename: varchar("basename").notNull().unique(),
    original_filename: varchar("original_filename"),
    size: integer("size"),
    content_type: varchar("content_type"),
    has_preview: boolean("has_preview").notNull().default(false),
    uploader_id: integer("uploader_id").references(() => users.id, {
      onDelete: "set null",
    }),
    message_id: integer("message_id").references(() => roomMessages.id, {
      onDelete: "set null",
    }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ix_file_attachments_id").on(t.id),
    index("ix_file_attachments_basename").on(t.basename),
  ],
)

export const messageReactions = pgTable(
  "message_reactions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    message_id: integer("message_id")
      .notNull()
      .references(() => roomMessages.id, { onDelete: "cascade" }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_message_reactions_message_user_emoji").on(
      t.message_id,
      t.user_id,
      t.emoji,
    ),
  ],
)

export const roomInvitations = pgTable(
  "room_invitations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    room_id: integer("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    inviter_id: integer("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitee_id: integer("invitee_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    token: varchar("token", { length: 64 }).notNull().unique(),
    is_global: boolean("is_global").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ix_room_invitations_id").on(t.id),
    index("ix_room_invitations_token").on(t.token),
  ],
)

export const notifications = pgTable(
  "notifications",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitation_id: integer("invitation_id").references(
      () => roomInvitations.id,
      { onDelete: "cascade" },
    ),
    type: varchar("type", { length: 64 }).notNull(),
    params: jsonb("params").$type<Record<string, string | number> | null>(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    importance: varchar("importance", { length: 16 })
      .notNull()
      .default("normal"),
    action_label: varchar("action_label", { length: 64 }),
    action_token: varchar("action_token", { length: 64 }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ix_notifications_user_id").on(t.user_id)],
)

export type User = typeof users.$inferSelect
export type Room = typeof rooms.$inferSelect
export type RoomMember = typeof roomMembers.$inferSelect
export type RoomMessage = typeof roomMessages.$inferSelect
export type MessageReaction = typeof messageReactions.$inferSelect
export type FileAttachment = typeof fileAttachments.$inferSelect
export type RoomInvitation = typeof roomInvitations.$inferSelect
export type Notification = typeof notifications.$inferSelect
