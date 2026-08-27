-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_history" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_history" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "position_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_history" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_type_history" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_type_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "source" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
-- Hand-edited (Story 1.20, nest-prisma.md deviation): narrowed from a full
-- unique index to a partial one — the DB-level backstop for "at most one
-- open row per employee" (AD-7). Prisma's schema DSL cannot express a
-- partial index directly; the `@@unique([employeeId])` placeholder in
-- schema.prisma exists only to make Prisma emit an index here to narrow.
CREATE UNIQUE INDEX "grade_history_employeeId_key" ON "grade_history"("employeeId") WHERE "effectiveTo" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "position_history_employeeId_key" ON "position_history"("employeeId") WHERE "effectiveTo" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "department_history_employeeId_key" ON "department_history"("employeeId") WHERE "effectiveTo" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "employment_type_history_employeeId_key" ON "employment_type_history"("employeeId") WHERE "effectiveTo" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "timeline_events_employeeId_type_effectiveDate_source_key" ON "timeline_events"("employeeId", "type", "effectiveDate", "source");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_history" ADD CONSTRAINT "grade_history_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_history" ADD CONSTRAINT "position_history_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_history" ADD CONSTRAINT "department_history_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_type_history" ADD CONSTRAINT "employment_type_history_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
