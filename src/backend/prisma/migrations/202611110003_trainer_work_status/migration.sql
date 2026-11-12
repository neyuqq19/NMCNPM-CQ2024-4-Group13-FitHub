CREATE TYPE "TrainerWorkStatus" AS ENUM ('ACTIVE', 'ON_LEAVE');
ALTER TABLE "TrainerProfile" ADD COLUMN "workStatus" "TrainerWorkStatus" NOT NULL DEFAULT 'ACTIVE';
