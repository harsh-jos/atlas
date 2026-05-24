-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('BOOK', 'PAPER', 'DOCS', 'TUTORIAL', 'COURSE', 'WEBSITE');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('PART_OF', 'USES', 'PREREQUISITE', 'CONTRASTS', 'SEE_ALSO');

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT,
    "tags" TEXT[],
    "status" "EntryStatus" NOT NULL DEFAULT 'DRAFT',
    "collectionId" TEXT NOT NULL,
    "metadata" JSONB,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "url" TEXT,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relation" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relationType" "RelationType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Relation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_slug_key" ON "Entry"("slug");

-- CreateIndex
CREATE INDEX "entry_tags_gin" ON "Entry" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Relation_fromId_toId_relationType_key" ON "Relation"("fromId", "toId", "relationType");

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
