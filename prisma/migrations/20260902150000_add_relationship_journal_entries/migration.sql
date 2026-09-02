-- CreateTable
CREATE TABLE "relationship_journal_entries" (
    "id" TEXT NOT NULL,
    "actorEmployeeId" TEXT,
    "subjectEmployeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationship_journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "relationship_journal_entries_subjectEmployeeId_kind_createdAt_idx" ON "relationship_journal_entries"("subjectEmployeeId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "relationship_journal_entries" ADD CONSTRAINT "relationship_journal_entries_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_journal_entries" ADD CONSTRAINT "relationship_journal_entries_subjectEmployeeId_fkey" FOREIGN KEY ("subjectEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
