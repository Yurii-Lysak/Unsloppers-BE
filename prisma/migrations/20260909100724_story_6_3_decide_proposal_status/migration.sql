-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ResourcingProposalStatus" ADD VALUE 'approved';
ALTER TYPE "ResourcingProposalStatus" ADD VALUE 'rejected';

-- AlterTable
ALTER TABLE "resourcing_proposals" ADD COLUMN     "decisionReason" VARCHAR(2000);
