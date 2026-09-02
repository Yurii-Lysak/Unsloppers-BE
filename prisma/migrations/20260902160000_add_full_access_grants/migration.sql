-- CreateTable
CREATE TABLE "full_access_grants" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "full_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "full_access_grants_employeeId_revokedAt_idx" ON "full_access_grants"("employeeId", "revokedAt");

-- AddForeignKey
ALTER TABLE "full_access_grants" ADD CONSTRAINT "full_access_grants_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
