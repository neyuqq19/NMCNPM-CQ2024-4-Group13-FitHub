-- UC13: workout log (sessions, exercises, sets) and personal records.
CREATE TYPE "WorkoutSetType" AS ENUM ('W','R','D','F');

CREATE TABLE "WorkoutSession" (
 "id" UUID PRIMARY KEY,
 "memberId" UUID NOT NULL REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "title" TEXT NOT NULL,
 "performedOn" DATE NOT NULL,
 "durationMinutes" INTEGER,
 "notes" TEXT,
 "totalVolume" DECIMAL(12,2) NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "WorkoutSession_duration_check" CHECK ("durationMinutes" IS NULL OR "durationMinutes" BETWEEN 1 AND 600),
 CONSTRAINT "WorkoutSession_volume_check" CHECK ("totalVolume" >= 0)
);
CREATE INDEX "WorkoutSession_memberId_performedOn_idx" ON "WorkoutSession"("memberId","performedOn");

CREATE TABLE "WorkoutExercise" (
 "id" UUID PRIMARY KEY,
 "sessionId" UUID NOT NULL REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "exerciseName" TEXT NOT NULL,
 "exerciseKey" TEXT NOT NULL,
 "orderIndex" INTEGER NOT NULL
);
CREATE UNIQUE INDEX "WorkoutExercise_sessionId_exerciseKey_key" ON "WorkoutExercise"("sessionId","exerciseKey");
CREATE INDEX "WorkoutExercise_exerciseKey_idx" ON "WorkoutExercise"("exerciseKey");

CREATE TABLE "WorkoutSet" (
 "id" UUID PRIMARY KEY,
 "exerciseId" UUID NOT NULL REFERENCES "WorkoutExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "setNumber" INTEGER NOT NULL,
 "setType" "WorkoutSetType" NOT NULL,
 "reps" INTEGER NOT NULL,
 "weightKg" DECIMAL(6,2) NOT NULL,
 "estimated1RM" DECIMAL(8,2),
 "isPR" BOOLEAN NOT NULL DEFAULT false,
 CONSTRAINT "WorkoutSet_reps_check" CHECK ("reps" BETWEEN 1 AND 500),
 CONSTRAINT "WorkoutSet_weight_check" CHECK ("weightKg" BETWEEN 0 AND 1000),
 -- BR02/BR03: no Epley estimate (and so no PR) for W/D/F or bodyweight sets.
 CONSTRAINT "WorkoutSet_1rm_check" CHECK ("estimated1RM" IS NULL OR ("setType" = 'R' AND "weightKg" > 0)),
 CONSTRAINT "WorkoutSet_pr_check" CHECK (NOT "isPR" OR "estimated1RM" IS NOT NULL)
);
CREATE UNIQUE INDEX "WorkoutSet_exerciseId_setNumber_key" ON "WorkoutSet"("exerciseId","setNumber");

CREATE TABLE "PersonalRecord" (
 "id" UUID PRIMARY KEY,
 "memberId" UUID NOT NULL REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "exerciseName" TEXT NOT NULL,
 "exerciseKey" TEXT NOT NULL,
 "oneRepMax" DECIMAL(8,2) NOT NULL,
 "weightKg" DECIMAL(6,2) NOT NULL,
 "reps" INTEGER NOT NULL,
 "achievedOn" DATE NOT NULL,
 "setId" UUID NOT NULL,
 "isBaseline" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "PersonalRecord_1rm_check" CHECK ("oneRepMax" > 0)
);
CREATE UNIQUE INDEX "PersonalRecord_memberId_exerciseKey_key" ON "PersonalRecord"("memberId","exerciseKey");
