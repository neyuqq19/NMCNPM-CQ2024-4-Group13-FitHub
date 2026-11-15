-- UC08: lich hen PT 1-1.
CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED', 'CANCELLED_BY_MEMBER', 'CANCELLED_BY_PT', 'NO_SHOW', 'COMPLETED');
CREATE TYPE "PtSessionState" AS ENUM ('HELD', 'CONSUMED', 'REFUNDED');
CREATE SEQUENCE "appointment_code_seq";

CREATE TABLE "Appointment" (
  "id" uuid PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "memberId" uuid NOT NULL REFERENCES "MemberProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "trainerId" uuid NOT NULL REFERENCES "TrainerProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "slotId" uuid NOT NULL REFERENCES "WorkingSlot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "membershipId" uuid NOT NULL REFERENCES "Membership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
  "ptSessionState" "PtSessionState" NOT NULL DEFAULT 'HELD',
  "cancelReason" text,
  "cancelledAt" timestamptz(3),
  "compensationGranted" boolean NOT NULL DEFAULT false,
  "verifiedById" uuid REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL,
  -- Chi mot lich dang hieu luc tren mot ca: chan dat trung ngay ca khi co race.
  -- Lich da huy / NO_SHOW thi ca duoc mo lai cho nguoi khac.
  CHECK ("compensationGranted" = false OR "status" = 'CANCELLED_BY_PT')
);
CREATE UNIQUE INDEX "Appointment_slot_active_key" ON "Appointment" ("slotId") WHERE "status" IN ('CONFIRMED', 'COMPLETED');
CREATE INDEX "Appointment_memberId_status_idx" ON "Appointment" ("memberId", "status");
CREATE INDEX "Appointment_trainerId_status_idx" ON "Appointment" ("trainerId", "status");
CREATE INDEX "Appointment_slotId_idx" ON "Appointment" ("slotId");
