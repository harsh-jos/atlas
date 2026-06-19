-- Remove the editorial DRAFT/PUBLISHED status from entries.
-- Atlas is a personal reading home, not a publishing tool: an entry simply exists.

-- DropColumn
ALTER TABLE "Entry" DROP COLUMN "status";

-- DropEnum
DROP TYPE "EntryStatus";
