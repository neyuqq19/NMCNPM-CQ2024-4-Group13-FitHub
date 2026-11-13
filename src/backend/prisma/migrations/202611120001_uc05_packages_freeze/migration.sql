-- CreateEnum
CREATE TYPE "FreezeStatus" AS ENUM ('ACTIVE', 'ENDED');

-- AlterTable: Package PT sessions support
ALTER TABLE "Package"
  ADD COLUMN "ptSessionsIncluded" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Package"
  ADD CONSTRAINT "package_pt_sessions_nonnegative" CHECK ("ptSessionsIncluded" >= 0);

-- AlterTable: Membership PT sessions snapshot & remaining balance
ALTER TABLE "Membership"
  ADD COLUMN "ptSessionsSnapshot" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ptSessionsRemaining" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Membership"
  ADD CONSTRAINT "membership_pt_sessions_valid" CHECK (
    "ptSessionsSnapshot" >= 0
    AND "ptSessionsRemaining" >= 0
    AND "ptSessionsRemaining" <= "ptSessionsSnapshot"
  );

-- CreateTable: FreezePeriod
CREATE TABLE "FreezePeriod" (
  "id" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsBefore" DATE NOT NULL,
  "days" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "FreezeStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" UUID NOT NULL,
  "endedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "FreezePeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "freeze_days_valid" CHECK (
    ("status" = 'ACTIVE' AND "days" >= 7 AND "days" <= 30)
    OR ("status" = 'ENDED' AND "days" >= 0 AND "days" <= 30)
  ),
  CONSTRAINT "freeze_period_valid" CHECK (
    ("status" = 'ACTIVE' AND "endsBefore" > "startsOn")
    OR ("status" = 'ENDED' AND "endsBefore" >= "startsOn")
  ),
  CONSTRAINT "freeze_reason_required" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "FreezePeriod_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FreezePeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FreezePeriod_membershipId_status_idx" ON "FreezePeriod"("membershipId", "status");
CREATE UNIQUE INDEX "FreezePeriod_one_active_per_membership" ON "FreezePeriod"("membershipId") WHERE "status" = 'ACTIVE';

-- Preserve purchased terms while allowing controlled SCHEDULED shifts during freeze/unfreeze transactions
CREATE OR REPLACE FUNCTION fithub_membership_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Payment" WHERE "membershipId" = OLD."id" AND "status" = 'CONFIRMED') THEN
    IF (NEW."memberId", NEW."packageId", NEW."packageNameSnapshot", NEW."priceSnapshot", NEW."durationMonthsSnapshot", NEW."grantsGymAccessSnapshot", NEW."code", NEW."requestId")
      IS DISTINCT FROM
      (OLD."memberId", OLD."packageId", OLD."packageNameSnapshot", OLD."priceSnapshot", OLD."durationMonthsSnapshot", OLD."grantsGymAccessSnapshot", OLD."code", OLD."requestId") THEN
      RAISE EXCEPTION 'Purchased membership terms must be preserved' USING ERRCODE = '23514';
    END IF;
    IF NEW."ptSessionsSnapshot" IS DISTINCT FROM OLD."ptSessionsSnapshot" THEN
      IF NOT (current_setting('fithub.allow_pt_compensation', true) = 'on' AND NEW."ptSessionsSnapshot" >= OLD."ptSessionsSnapshot") THEN
        RAISE EXCEPTION 'Purchased membership terms must be preserved' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW."startsOn" IS DISTINCT FROM OLD."startsOn" THEN
      IF NOT (OLD."status" = 'SCHEDULED' AND NEW."status" IN ('SCHEDULED', 'ACTIVE') AND current_setting('fithub.allow_schedule_shift', true) = 'on') THEN
        RAISE EXCEPTION 'Purchased membership terms must be preserved' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

