CREATE TABLE "TrainerProfile" (
  "id" UUID PRIMARY KEY,
  "userId" UUID NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "trainerCode" TEXT NOT NULL UNIQUE,
  "bio" TEXT NOT NULL DEFAULT '',
  "specialties" TEXT[] NOT NULL DEFAULT '{}',
  "experienceYears" INTEGER NOT NULL DEFAULT 0 CHECK ("experienceYears" BETWEEN 0 AND 50),
  "avatarUrl" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "TrainerCertification" (
  "id" UUID PRIMARY KEY,
  "trainerId" UUID NOT NULL REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "issuedAt" DATE NOT NULL,
  "credentialUrl" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TrainerCertification_trainerId_idx" ON "TrainerCertification"("trainerId");

CREATE FUNCTION fithub_trainer_profile_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE id = NEW."userId" AND role = 'TRAINER' FOR SHARE) THEN
    RAISE EXCEPTION 'TrainerProfile requires a TRAINER account' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trainer_profile_role BEFORE INSERT OR UPDATE OF "userId" ON "TrainerProfile"
  FOR EACH ROW EXECUTE FUNCTION fithub_trainer_profile_role();

-- Reserve PT001 through PT003 for the demo accounts.
CREATE SEQUENCE fithub_trainer_code START 4;
CREATE FUNCTION fithub_draft_trainer_profile(owner_id uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO "TrainerProfile" (id, "userId", "trainerCode", "updatedAt")
  VALUES (gen_random_uuid(), owner_id, 'PT' || to_char(nextval('fithub_trainer_code'), 'FM0000000000'), CURRENT_TIMESTAMP);
$$;
SELECT fithub_draft_trainer_profile(id) FROM "User" WHERE role = 'TRAINER';

CREATE FUNCTION fithub_trainer_account_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role = OLD.role THEN RETURN NEW; END IF;
  IF NEW.role = 'TRAINER' THEN
    PERFORM fithub_draft_trainer_profile(NEW.id);
  ELSIF EXISTS (SELECT 1 FROM "TrainerProfile" WHERE "userId" = NEW.id) THEN
    RAISE EXCEPTION 'Account owns a TrainerProfile' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trainer_account_role AFTER INSERT OR UPDATE OF role ON "User"
  FOR EACH ROW EXECUTE FUNCTION fithub_trainer_account_role();
