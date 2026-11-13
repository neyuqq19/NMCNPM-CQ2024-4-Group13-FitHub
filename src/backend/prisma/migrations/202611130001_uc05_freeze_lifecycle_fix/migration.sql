-- UC05 (SCRUM-89): Allow ENDED freeze periods to record actual elapsed days and allow schedule shift on early unfreeze

ALTER TABLE "FreezePeriod" DROP CONSTRAINT IF EXISTS "freeze_days_valid";
ALTER TABLE "FreezePeriod" ADD CONSTRAINT "freeze_days_valid" CHECK (
  ("status" = 'ACTIVE' AND "days" >= 7 AND "days" <= 30)
  OR ("status" = 'ENDED' AND "days" >= 0 AND "days" <= 30)
);

ALTER TABLE "FreezePeriod" DROP CONSTRAINT IF EXISTS "freeze_period_valid";
ALTER TABLE "FreezePeriod" ADD CONSTRAINT "freeze_period_valid" CHECK (
  ("status" = 'ACTIVE' AND "endsBefore" > "startsOn")
  OR ("status" = 'ENDED' AND "endsBefore" >= "startsOn")
);

-- Preserve purchased terms while allowing controlled SCHEDULED shifts during freeze/unfreeze transactions and PT compensation
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
