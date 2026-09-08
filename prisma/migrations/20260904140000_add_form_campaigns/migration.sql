-- CreateEnum
CREATE TYPE "FormCampaignStatus" AS ENUM ('draft', 'active');

-- CreateTable
CREATE TABLE "form_campaigns" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "purpose" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "FormCampaignStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_campaigns_creatorId_idx" ON "form_campaigns"("creatorId");

-- AddForeignKey
ALTER TABLE "form_campaigns" ADD CONSTRAINT "form_campaigns_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "form_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
