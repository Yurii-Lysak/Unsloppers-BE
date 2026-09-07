-- AlterTable
ALTER TABLE "access_graph_generation" ALTER COLUMN "id" SET DEFAULT 'default';

-- AlterTable
ALTER TABLE "timeline_events" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerEmployeeId" TEXT,
    "filters" JSONB NOT NULL,
    "columnIds" JSONB NOT NULL,
    "sort" TEXT,
    "order" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_view_shares" (
    "id" TEXT NOT NULL,
    "savedViewId" TEXT NOT NULL,
    "recipientEmployeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_view_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_views_ownerEmployeeId_idx" ON "saved_views"("ownerEmployeeId");

-- CreateIndex
CREATE INDEX "saved_view_shares_recipientEmployeeId_idx" ON "saved_view_shares"("recipientEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_view_shares_savedViewId_recipientEmployeeId_key" ON "saved_view_shares"("savedViewId", "recipientEmployeeId");

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_view_shares" ADD CONSTRAINT "saved_view_shares_savedViewId_fkey" FOREIGN KEY ("savedViewId") REFERENCES "saved_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_view_shares" ADD CONSTRAINT "saved_view_shares_recipientEmployeeId_fkey" FOREIGN KEY ("recipientEmployeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "relationship_journal_entries_subjectEmployeeId_kind_createdAt_i" RENAME TO "relationship_journal_entries_subjectEmployeeId_kind_created_idx";
