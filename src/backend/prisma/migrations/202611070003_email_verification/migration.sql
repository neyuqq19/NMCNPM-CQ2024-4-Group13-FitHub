CREATE TABLE "EmailVerification" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "email" TEXT NOT NULL, "codeHash" TEXT NOT NULL,
 "generation" INTEGER NOT NULL DEFAULT 1, "expiresAt" TIMESTAMPTZ(3) NOT NULL, "lastSentAt" TIMESTAMPTZ(3) NOT NULL,
 "failedAttempts" INTEGER NOT NULL DEFAULT 0, "lockedUntil" TIMESTAMPTZ(3), "consumedAt" TIMESTAMPTZ(3),
 "deliveryStatus" TEXT NOT NULL DEFAULT 'SENDING', "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "email_verification_attempts" CHECK ("failedAttempts" >= 0 AND "failedAttempts" <= 5),
 CONSTRAINT "email_verification_hash" CHECK ("codeHash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "EmailVerification_userId_key" ON "EmailVerification"("userId");
ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
