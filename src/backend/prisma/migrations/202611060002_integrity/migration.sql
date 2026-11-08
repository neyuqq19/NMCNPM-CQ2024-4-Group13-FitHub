-- Prisma 6 does not express CHECK constraints or triggers in schema.prisma.
-- Always use migrations, not db push, to retain these guarantees.
ALTER TABLE "User"
  ADD CONSTRAINT "user_contact_required" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL),
  ADD CONSTRAINT "user_email_canonical" CHECK ("email" IS NULL OR ("email" = lower(btrim("email")) AND "email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  ADD CONSTRAINT "user_phone_canonical" CHECK ("phone" IS NULL OR "phone" ~ '^0[35789][0-9]{8}$'),
  ADD CONSTRAINT "user_name_required" CHECK (length(btrim("displayName")) > 0),
  ADD CONSTRAINT "user_password_hash_format" CHECK ("passwordHash" IS NULL OR "passwordHash" ~ '^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$'),
  ADD CONSTRAINT "user_active_verified" CHECK ("status" <> 'ACTIVE' OR ("verifiedAt" IS NOT NULL AND "passwordHash" IS NOT NULL)),
  ADD CONSTRAINT "user_failed_attempts_nonnegative" CHECK ("failedLoginAttempts" >= 0);
ALTER TABLE "Session"
  ADD CONSTRAINT "session_expiry_valid" CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "session_token_hash_format" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "MemberProfile"
  ADD CONSTRAINT "profile_code_required" CHECK (length(btrim("memberCode")) > 0),
  ADD CONSTRAINT "profile_height_positive" CHECK ("heightCm" IS NULL OR "heightCm" > 0),
  ADD CONSTRAINT "profile_weight_positive" CHECK ("weightKg" IS NULL OR "weightKg" > 0),
  ADD CONSTRAINT "profile_version_nonnegative" CHECK ("version" >= 0);
ALTER TABLE "Package"
  ADD CONSTRAINT "package_duration_supported" CHECK ("durationMonths" IN (1, 3, 6, 12)),
  ADD CONSTRAINT "package_price_positive" CHECK ("price" > 0),
  ADD CONSTRAINT "package_labels_required" CHECK (length(btrim("name")) > 0 AND length(btrim("code")) > 0);
ALTER TABLE "Membership"
  ADD CONSTRAINT "membership_period_valid" CHECK ("endsBefore" > "startsOn"),
  ADD CONSTRAINT "membership_price_positive" CHECK ("priceSnapshot" > 0),
  ADD CONSTRAINT "membership_duration_supported" CHECK ("durationMonthsSnapshot" IN (1, 3, 6, 12)),
  ADD CONSTRAINT "membership_version_nonnegative" CHECK ("version" >= 0),
  ADD CONSTRAINT "membership_labels_required" CHECK (length(btrim("code")) > 0 AND length(btrim("packageNameSnapshot")) > 0);
ALTER TABLE "Payment"
  ADD CONSTRAINT "payment_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "payment_code_required" CHECK (length(btrim("code")) > 0),
  ADD CONSTRAINT "payment_confirmation_complete" CHECK (
    ("status" = 'CONFIRMED' AND "confirmedById" IS NOT NULL AND "confirmedAt" IS NOT NULL)
    OR ("status" <> 'CONFIRMED' AND "confirmedById" IS NULL AND "confirmedAt" IS NULL)
  );

-- A MemberProfile belongs to a Member account, never to an Admin/Trainer.
CREATE FUNCTION fithub_profile_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."userId" AND "role" = 'MEMBER') THEN
    RAISE EXCEPTION 'MemberProfile requires a MEMBER account' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "profile_member_role" BEFORE INSERT OR UPDATE OF "userId" ON "MemberProfile"
  FOR EACH ROW EXECUTE FUNCTION fithub_profile_role();

-- Cross-table state is checked at COMMIT, allowing both writes in one transaction.
-- Time eligibility and permissions still need backend validation at request time.
CREATE FUNCTION fithub_membership_payment_consistent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_id uuid;
  membership_row "Membership"%ROWTYPE;
  payment_row "Payment"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'Membership' THEN target_id := COALESCE(NEW."id", OLD."id");
  ELSE target_id := COALESCE(NEW."membershipId", OLD."membershipId"); END IF;
  SELECT * INTO membership_row FROM "Membership" WHERE "id" = target_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO payment_row FROM "Payment" WHERE "membershipId" = target_id;
  IF membership_row."status" IN ('SCHEDULED', 'ACTIVE', 'FROZEN', 'EXPIRED') THEN
    IF payment_row."status" IS DISTINCT FROM 'CONFIRMED' THEN
      RAISE EXCEPTION 'Paid membership requires a confirmed payment' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF payment_row."status" = 'CONFIRMED' THEN
    IF membership_row."status" NOT IN ('SCHEDULED', 'ACTIVE', 'FROZEN', 'EXPIRED') OR payment_row."amount" <> membership_row."priceSnapshot" THEN
      RAISE EXCEPTION 'Confirmed payment and membership are inconsistent' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "membership_payment_consistent" AFTER INSERT OR UPDATE OR DELETE ON "Membership"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fithub_membership_payment_consistent();
CREATE CONSTRAINT TRIGGER "payment_membership_consistent" AFTER INSERT OR UPDATE OR DELETE ON "Payment"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fithub_membership_payment_consistent();

CREATE FUNCTION fithub_payment_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'CONFIRMED' THEN RAISE EXCEPTION 'Confirmed payments must be retained' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."membershipId" <> NEW."membershipId" THEN
      RAISE EXCEPTION 'Payment cannot be moved to another membership' USING ERRCODE = '23514';
    END IF;
    IF OLD."status" = 'CONFIRMED' AND
      (NEW."status", NEW."amount", NEW."method", NEW."confirmedById", NEW."confirmedAt", NEW."idempotencyKey", NEW."code")
      IS DISTINCT FROM
      (OLD."status", OLD."amount", OLD."method", OLD."confirmedById", OLD."confirmedAt", OLD."idempotencyKey", OLD."code") THEN
      RAISE EXCEPTION 'Confirmed payment is immutable in PA4' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."status" = 'CONFIRMED' AND (TG_OP = 'INSERT' OR OLD."status" <> 'CONFIRMED') THEN
    IF NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."confirmedById" AND "role" = 'ADMIN' AND "status" = 'ACTIVE') THEN
      RAISE EXCEPTION 'Cash confirmation requires an active admin' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "Membership" m JOIN "MemberProfile" p ON p."id" = m."memberId" JOIN "User" u ON u."id" = p."userId"
      WHERE m."id" = NEW."membershipId" AND u."role" = 'MEMBER' AND u."status" = 'ACTIVE' AND u."verifiedAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'Cash confirmation requires an active verified member' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "payment_history" BEFORE INSERT OR UPDATE OR DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION fithub_payment_history();

CREATE FUNCTION fithub_membership_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Payment" WHERE "membershipId" = OLD."id" AND "status" = 'CONFIRMED') AND
    (NEW."memberId", NEW."packageId", NEW."packageNameSnapshot", NEW."priceSnapshot", NEW."durationMonthsSnapshot", NEW."grantsGymAccessSnapshot", NEW."startsOn", NEW."code", NEW."requestId")
    IS DISTINCT FROM
    (OLD."memberId", OLD."packageId", OLD."packageNameSnapshot", OLD."priceSnapshot", OLD."durationMonthsSnapshot", OLD."grantsGymAccessSnapshot", OLD."startsOn", OLD."code", OLD."requestId") THEN
    RAISE EXCEPTION 'Purchased membership terms must be preserved' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "membership_snapshot" BEFORE UPDATE ON "Membership"
  FOR EACH ROW EXECUTE FUNCTION fithub_membership_snapshot();
