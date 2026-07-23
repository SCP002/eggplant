CREATE TYPE "public"."registration_rule" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TABLE "registration_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "registration_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" varchar NOT NULL,
	"action" "registration_rule" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_rules_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "ix_registration_rules_id" ON "registration_rules" USING btree ("id");