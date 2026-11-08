CREATE TYPE "AccessWindow" AS ENUM ('REGULAR','OFF_PEAK');
ALTER TABLE "Package" ADD COLUMN "accessWindow" "AccessWindow" NOT NULL DEFAULT 'REGULAR';
ALTER TABLE "Membership" ADD COLUMN "accessWindowSnapshot" "AccessWindow" NOT NULL DEFAULT 'REGULAR';
CREATE TABLE "CheckInScanner" (
 "id" UUID PRIMARY KEY, "sessionId" UUID NOT NULL REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "adminId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "deviceId" UUID NOT NULL, "label" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CheckInScanner_sessionId_deviceId_key" ON "CheckInScanner"("sessionId","deviceId");
CREATE TABLE "CheckInQr" (
 "id" UUID PRIMARY KEY, "memberId" UUID NOT NULL REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "sessionId" UUID NOT NULL REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "step" INTEGER NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "CheckInQr_sessionId_step_key" ON "CheckInQr"("sessionId","step");
CREATE INDEX "CheckInQr_memberId_createdAt_idx" ON "CheckInQr"("memberId","createdAt");
CREATE TABLE "CheckInTransaction" (
 "id" UUID PRIMARY KEY, "scannerId" UUID NOT NULL REFERENCES "CheckInScanner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "qrId" UUID REFERENCES "CheckInQr"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "payloadHash" TEXT NOT NULL, "result" JSONB NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "CheckInRecord" (
 "id" UUID PRIMARY KEY, "transactionId" UUID NOT NULL REFERENCES "CheckInTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "memberId" UUID NOT NULL REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "membershipId" UUID NOT NULL REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "checkedInAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "CheckInRecord_transactionId_key" ON "CheckInRecord"("transactionId");
CREATE INDEX "CheckInRecord_memberId_checkedInAt_idx" ON "CheckInRecord"("memberId","checkedInAt");
-- The purchased access window is immutable like the other purchased terms.
CREATE FUNCTION fithub_access_window_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."accessWindowSnapshot" IS DISTINCT FROM OLD."accessWindowSnapshot" AND EXISTS (
 SELECT 1 FROM "Payment" WHERE "membershipId"=OLD."id" AND "status"='CONFIRMED') THEN
 RAISE EXCEPTION 'Purchased membership terms must be preserved' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "membership_access_window_snapshot" BEFORE UPDATE ON "Membership" FOR EACH ROW EXECUTE FUNCTION fithub_access_window_snapshot();
