-- CreateTable
CREATE TABLE "functional_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "functional_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "functional_role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "functional_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "functional_role_assignments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "functional_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "functional_roles_name_lower_key" ON "functional_roles"(LOWER("name"));

-- CreateIndex
CREATE INDEX "functional_role_permissions_roleId_idx" ON "functional_role_permissions"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "functional_role_permissions_roleId_permissionKey_key" ON "functional_role_permissions"("roleId", "permissionKey");

-- CreateIndex
CREATE INDEX "functional_role_assignments_employeeId_idx" ON "functional_role_assignments"("employeeId");

-- CreateIndex
CREATE INDEX "functional_role_assignments_roleId_idx" ON "functional_role_assignments"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "functional_role_assignments_employeeId_roleId_key" ON "functional_role_assignments"("employeeId", "roleId");

-- AddForeignKey
ALTER TABLE "functional_role_permissions" ADD CONSTRAINT "functional_role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "functional_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "functional_role_assignments" ADD CONSTRAINT "functional_role_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "functional_role_assignments" ADD CONSTRAINT "functional_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "functional_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
