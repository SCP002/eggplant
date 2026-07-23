CREATE TABLE "notifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"invitation_id" integer,
	"type" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"importance" varchar(16) DEFAULT 'normal' NOT NULL,
	"action_label" varchar(64),
	"action_token" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_invitation_id_room_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."room_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_notifications_user_id" ON "notifications" USING btree ("user_id");