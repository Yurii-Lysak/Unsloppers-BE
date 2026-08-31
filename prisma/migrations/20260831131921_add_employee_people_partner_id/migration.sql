-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "peoplePartnerId" TEXT;

-- CreateIndex
CREATE INDEX "employees_peoplePartnerId_idx" ON "employees"("peoplePartnerId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_peoplePartnerId_fkey" FOREIGN KEY ("peoplePartnerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
