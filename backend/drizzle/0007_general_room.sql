ALTER TABLE "rooms" RENAME COLUMN "is_default" TO "is_general";--> statement-breakpoint
ALTER INDEX "uq_rooms_is_default_true" RENAME TO "uq_rooms_is_general_true";--> statement-breakpoint
UPDATE "rooms" SET "name" = 'General' WHERE "is_general" = true AND "name" = 'Default room';--> statement-breakpoint
