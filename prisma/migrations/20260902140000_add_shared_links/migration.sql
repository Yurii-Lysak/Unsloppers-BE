-- CreateTable
CREATE TABLE "shared_links" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "subjectEmployeeId" TEXT NOT NULL,
    "creatorEmployeeId" TEXT NOT NULL,
    "recipientEmployeeId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_link_sections" (
    "id" TEXT NOT NULL,
    "sharedLinkId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,

    CONSTRAINT "shared_link_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shared_links_token_key" ON "shared_links"("token");

-- CreateIndex
CREATE INDEX "shared_links_subjectEmployeeId_idx" ON "shared_links"("subjectEmployeeId");

-- CreateIndex
CREATE INDEX "shared_links_recipientEmployeeId_idx" ON "shared_links"("recipientEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "shared_link_sections_sharedLinkId_sectionId_key" ON "shared_link_sections"("sharedLinkId", "sectionId");

-- AddForeignKey
ALTER TABLE "shared_links" ADD CONSTRAINT "shared_links_subjectEmployeeId_fkey" FOREIGN KEY ("subjectEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_links" ADD CONSTRAINT "shared_links_creatorEmployeeId_fkey" FOREIGN KEY ("creatorEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_links" ADD CONSTRAINT "shared_links_recipientEmployeeId_fkey" FOREIGN KEY ("recipientEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_link_sections" ADD CONSTRAINT "shared_link_sections_sharedLinkId_fkey" FOREIGN KEY ("sharedLinkId") REFERENCES "shared_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
