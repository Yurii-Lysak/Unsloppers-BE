-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('active', 'dismissed');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'active';
