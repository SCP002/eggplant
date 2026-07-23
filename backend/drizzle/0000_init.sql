CREATE TYPE "public"."ai_modification_preset" AS ENUM('none', 'pirate');--> statement-breakpoint
CREATE TYPE "public"."room_membership_status" AS ENUM('active', 'pending', 'banned');--> statement-breakpoint
CREATE TYPE "public"."room_role" AS ENUM('owner', 'admin', 'member', 'guest');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" varchar NOT NULL,
	"hashed_password" varchar NOT NULL,
	CONSTRAINT "admin_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "file_attachments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "file_attachments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"basename" varchar NOT NULL,
	"original_filename" varchar,
	"size" integer,
	"content_type" varchar,
	"uploader_id" integer,
	"message_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_attachments_basename_unique" UNIQUE("basename")
);
--> statement-breakpoint
CREATE TABLE "room_invitations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "room_invitations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"room_id" integer NOT NULL,
	"inviter_id" integer NOT NULL,
	"invitee_id" integer,
	"token" varchar(64) NOT NULL,
	"is_global" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "room_members" (
	"room_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" "room_role" DEFAULT 'member' NOT NULL,
	"status" "room_membership_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_message_id" integer
);
--> statement-breakpoint
CREATE TABLE "room_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "room_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"room_id" integer NOT NULL,
	"sender_id" integer,
	"parent_id" integer,
	"text" text NOT NULL,
	"system_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"ai_modification_preset" "ai_modification_preset" DEFAULT 'none' NOT NULL,
	"file_ids" jsonb
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rooms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar NOT NULL,
	"is_private" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"owner_id" integer,
	"avatar_url" varchar,
	"dm_user_low_id" integer,
	"dm_user_high_id" integer,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" varchar NOT NULL,
	"hashed_password" varchar NOT NULL,
	"username" varchar NOT NULL,
	"avatar_url" varchar,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verification_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" varchar NOT NULL,
	"username" varchar NOT NULL,
	"hashed_password" varchar NOT NULL,
	"code" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_message_id_room_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."room_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_invitations" ADD CONSTRAINT "room_invitations_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_invitations" ADD CONSTRAINT "room_invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_invitations" ADD CONSTRAINT "room_invitations_invitee_id_users_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_parent_id_room_messages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."room_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_system_user_id_users_id_fk" FOREIGN KEY ("system_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_dm_user_low_id_users_id_fk" FOREIGN KEY ("dm_user_low_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_dm_user_high_id_users_id_fk" FOREIGN KEY ("dm_user_high_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_file_attachments_id" ON "file_attachments" USING btree ("id");--> statement-breakpoint
CREATE INDEX "ix_file_attachments_basename" ON "file_attachments" USING btree ("basename");--> statement-breakpoint
CREATE INDEX "ix_room_invitations_id" ON "room_invitations" USING btree ("id");--> statement-breakpoint
CREATE INDEX "ix_room_invitations_token" ON "room_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "ix_room_messages_id" ON "room_messages" USING btree ("id");--> statement-breakpoint
CREATE INDEX "ix_rooms_id" ON "rooms" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rooms_is_default_true" ON "rooms" USING btree ("is_default") WHERE is_default;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rooms_dm_pair" ON "rooms" USING btree ("dm_user_low_id","dm_user_high_id");--> statement-breakpoint
CREATE INDEX "ix_users_id" ON "users" USING btree ("id");--> statement-breakpoint
CREATE INDEX "ix_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "ix_users_username" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "ix_verification_codes_id" ON "verification_codes" USING btree ("id");--> statement-breakpoint
CREATE INDEX "ix_verification_codes_email" ON "verification_codes" USING btree ("email");