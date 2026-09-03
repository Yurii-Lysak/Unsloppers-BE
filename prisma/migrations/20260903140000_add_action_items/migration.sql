-- CreateEnum
CREATE TYPE "ActionItemStatus" AS ENUM ('open', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ActionItemSource" AS ENUM ('manual', 'campaign');

-- CreateTable
CREATE TABLE "action_items" (
    "id" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATE NOT NULL,
    "link" TEXT,
    "status" "ActionItemStatus" NOT NULL DEFAULT 'open',
    "source" "ActionItemSource" NOT NULL,
    "campaignId" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "action_items_assigneeId_idx" ON "action_items"("assigneeId");

-- CreateIndex
CREATE INDEX "action_items_authorId_idx" ON "action_items"("authorId");

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
