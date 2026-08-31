-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('text', 'number', 'date', 'boolean', 'select', 'multi_select');

-- CreateEnum
CREATE TYPE "CustomFieldVisibility" AS ENUM ('management', 'employee', 'colleague');

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "visibility" "CustomFieldVisibility" NOT NULL DEFAULT 'management',
    "options" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_values" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fieldDefinitionId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(18,6),
    "valueDate" DATE,
    "valueBoolean" BOOLEAN,
    "valueSelect" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_name_key" ON "custom_field_definitions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_values_employeeId_fieldDefinitionId_key" ON "custom_field_values"("employeeId", "fieldDefinitionId");

-- CreateIndex
CREATE INDEX "custom_field_values_fieldDefinitionId_idx" ON "custom_field_values"("fieldDefinitionId");

-- CreateIndex
CREATE INDEX "custom_field_values_employeeId_idx" ON "custom_field_values"("employeeId");

-- AddForeignKey
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "custom_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
