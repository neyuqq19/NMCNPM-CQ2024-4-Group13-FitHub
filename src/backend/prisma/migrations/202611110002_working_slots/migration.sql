CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TYPE "WorkingSlotStatus" AS ENUM ('OPEN', 'BOOKED', 'UNAVAILABLE');
CREATE TABLE "WorkingSlot" (
  "id" uuid PRIMARY KEY,
  "trainerId" uuid NOT NULL REFERENCES "TrainerProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "workDate" date NOT NULL,
  "startTime" timestamptz(3) NOT NULL,
  "endTime" timestamptz(3) NOT NULL,
  "status" "WorkingSlotStatus" NOT NULL DEFAULT 'OPEN',
  "unavailableReason" text,
  "memberId" uuid REFERENCES "MemberProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  UNIQUE ("trainerId", "workDate", "startTime"),
  UNIQUE ("trainerId", "startTime"),
  CHECK ("endTime" = "startTime" + interval '60 minutes'),
  CHECK (("startTime" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = "workDate"
    AND ("endTime" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = "workDate"
    AND ("startTime" AT TIME ZONE 'Asia/Ho_Chi_Minh')::time >= time '06:00'
    AND ("endTime" AT TIME ZONE 'Asia/Ho_Chi_Minh')::time <= time '22:00'),
  CHECK ("memberId" IS NULL OR "status" = 'BOOKED'),
  -- Half-open ranges permit the next session exactly 15 minutes after the previous end.
  EXCLUDE USING gist ("trainerId" WITH =, tsrange(
    ("startTime" AT TIME ZONE 'UTC'), ("endTime" AT TIME ZONE 'UTC') + interval '15 minutes', '[)'
  ) WITH &&)
);
