-- UC10 (SCRUM-92): Equipment Catalog, Immutable EQ-<CATEGORY>-<SEQ> Code, Incidents & Lifecycle History

DO $$ BEGIN
  CREATE TYPE "EquipmentCategory" AS ENUM ('CARDIO', 'STRENGTH', 'FREE_WEIGHT', 'FUNCTIONAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EquipmentStatus" AS ENUM ('OPERATIONAL', 'OUT_OF_ORDER', 'RETIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Equipment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "EquipmentCategory" NOT NULL,
  "zone" TEXT NOT NULL,
  "status" "EquipmentStatus" NOT NULL DEFAULT 'OPERATIONAL',
  "qrCodePayload" TEXT NOT NULL,
  "purchasedAt" DATE,
  "warrantyUntil" DATE,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "equipment_code_format" CHECK ("code" ~ '^EQ-(CARDIO|STRENGTH|FREE_WEIGHT|FUNCTIONAL)-[0-9]{3,}$'),
  CONSTRAINT "equipment_name_required" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "equipment_zone_required" CHECK (length(btrim("zone")) > 0),
  CONSTRAINT "equipment_qr_required" CHECK (length(btrim("qrCodePayload")) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "Equipment_code_key" ON "Equipment"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Equipment_qrCodePayload_key" ON "Equipment"("qrCodePayload");
CREATE INDEX IF NOT EXISTS "Equipment_category_status_idx" ON "Equipment"("category", "status");
CREATE INDEX IF NOT EXISTS "Equipment_status_idx" ON "Equipment"("status");

CREATE TABLE IF NOT EXISTS "EquipmentIncident" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "equipmentId" UUID NOT NULL,
  "reportedById" UUID,
  "resolvedById" UUID,
  "description" TEXT NOT NULL,
  "severity" "IncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
  "resolutionNote" TEXT,
  "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EquipmentIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EquipmentIncident_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EquipmentIncident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EquipmentIncident_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "incident_description_required" CHECK (length(btrim("description")) > 0),
  CONSTRAINT "incident_resolution_note_when_resolved" CHECK ("status" <> 'RESOLVED' OR ("resolutionNote" IS NOT NULL AND length(btrim("resolutionNote")) > 0))
);

CREATE INDEX IF NOT EXISTS "EquipmentIncident_equipmentId_status_idx" ON "EquipmentIncident"("equipmentId", "status");

-- At most one OPEN incident per equipment at any time
CREATE UNIQUE INDEX IF NOT EXISTS "EquipmentIncident_one_open_per_equipment"
  ON "EquipmentIncident"("equipmentId")
  WHERE "status" = 'OPEN';

CREATE TABLE IF NOT EXISTS "EquipmentHistory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "equipmentId" UUID NOT NULL,
  "actorId" UUID,
  "action" TEXT NOT NULL,
  "fromStatus" "EquipmentStatus",
  "toStatus" "EquipmentStatus" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EquipmentHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EquipmentHistory_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EquipmentHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "EquipmentHistory_equipmentId_createdAt_idx" ON "EquipmentHistory"("equipmentId", "createdAt");

-- Trigger to enforce immutable code & qrCodePayload and prevent mutating RETIRED equipment status back
CREATE OR REPLACE FUNCTION fithub_equipment_invariants() RETURNS trigger AS $$
BEGIN
  IF NEW."code" <> OLD."code" OR NEW."qrCodePayload" <> OLD."qrCodePayload" THEN
    RAISE EXCEPTION 'equipmentCode and qrCodePayload are immutable';
  END IF;
  IF OLD."status" = 'RETIRED' AND NEW."status" <> 'RETIRED' THEN
    RAISE EXCEPTION 'RETIRED equipment cannot transition back to active states';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipment_invariants ON "Equipment";
CREATE TRIGGER trg_equipment_invariants
  BEFORE UPDATE ON "Equipment"
  FOR EACH ROW
  EXECUTE FUNCTION fithub_equipment_invariants();

