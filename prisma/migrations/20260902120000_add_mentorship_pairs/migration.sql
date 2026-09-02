-- Story 1.7: mentorship pairs for profile-header mentor resolution.

CREATE TABLE "mentorship_pairs" (
    "id" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "menteeId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "mentorship_pairs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mentorship_pairs_menteeId_endedAt_idx" ON "mentorship_pairs"("menteeId", "endedAt");
CREATE INDEX "mentorship_pairs_mentorId_idx" ON "mentorship_pairs"("mentorId");

-- At most one active pair per mentee (partial unique index).
CREATE UNIQUE INDEX "mentorship_pairs_active_mentee_key"
  ON "mentorship_pairs"("menteeId")
  WHERE "endedAt" IS NULL;

ALTER TABLE "mentorship_pairs"
  ADD CONSTRAINT "mentorship_pairs_mentorId_fkey"
  FOREIGN KEY ("mentorId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mentorship_pairs"
  ADD CONSTRAINT "mentorship_pairs_menteeId_fkey"
  FOREIGN KEY ("menteeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
