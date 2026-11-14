-- UC15 — bổ sung cột còn thiếu và sửa ràng buộc/trigger của Payment cho thanh toán VNPay.
-- Idempotent: dùng IF [NOT] EXISTS / CREATE OR REPLACE nên chạy an toàn trên DB đã
-- có sẵn một phần các thay đổi này. Luôn dùng migrate, không dùng db push.

-- 1. Cột bổ sung (schema.prisma phải khai báo tương ứng)
ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "transferReference" TEXT,
  ADD COLUMN IF NOT EXISTS "vnpAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "vnpExpiresAt" TIMESTAMPTZ(3);

-- 2. Ràng buộc. Thu tại quầy (CASH/BANK_TRANSFER) có người thu là Admin; VNPay do cổng
-- xác nhận nên không có người thu. Các ràng buộc mới đặt NOT VALID: áp dụng cho mọi
-- ghi mới nhưng không làm migration thất bại vì dữ liệu cũ (chạy VALIDATE CONSTRAINT sau khi rà soát).
ALTER TABLE "Payment"
  DROP CONSTRAINT IF EXISTS "payment_confirmation_complete",
  DROP CONSTRAINT IF EXISTS "payment_benefit_requires_confirmed",
  DROP CONSTRAINT IF EXISTS "payment_review_needs_reconciliation",
  DROP CONSTRAINT IF EXISTS "payment_failed_online_only",
  DROP CONSTRAINT IF EXISTS "payment_vnpay_has_reference",
  DROP CONSTRAINT IF EXISTS "payment_attempts_nonnegative",
  ADD CONSTRAINT "payment_confirmation_complete" CHECK (
    ("status" = 'CONFIRMED' AND "confirmedAt" IS NOT NULL AND (
        ("method" = 'VNPAY' AND "confirmedById" IS NULL)
        OR ("method" <> 'VNPAY' AND "confirmedById" IS NOT NULL)))
    OR ("status" <> 'CONFIRMED' AND "confirmedById" IS NULL AND "confirmedAt" IS NULL)
  ),
  ADD CONSTRAINT "payment_benefit_requires_confirmed"
    CHECK ("benefitStatus" = 'GRANTED' OR "status" = 'CONFIRMED') NOT VALID,
  ADD CONSTRAINT "payment_review_needs_reconciliation"
    CHECK ("benefitStatus" <> 'NEEDS_REVIEW' OR "reconciliationStatus" = 'MISMATCHED') NOT VALID,
  ADD CONSTRAINT "payment_failed_online_only"
    CHECK ("status" <> 'FAILED' OR "method" = 'VNPAY') NOT VALID,
  ADD CONSTRAINT "payment_vnpay_has_reference"
    CHECK ("method" <> 'VNPAY' OR "vnpTxnRef" IS NOT NULL) NOT VALID,
  ADD CONSTRAINT "payment_attempts_nonnegative" CHECK ("vnpAttempts" >= 0) NOT VALID;

ALTER TABLE "Invoice"
  DROP CONSTRAINT IF EXISTS "invoice_code_format",
  ADD CONSTRAINT "invoice_code_format"
    CHECK ("code" ~ '^INV-[0-9]{8}-[0-9]{4,}$') NOT VALID;

-- 3. Kiểm tra chéo Membership/Payment tại COMMIT. Mới: khoản VNPay đã thu nhưng chưa cấp
-- được quyền lợi (NEEDS_REVIEW) hoặc đã đối soát quyết định không cấp (NONE) được phép
-- đi cùng Membership PENDING_PAYMENT/CANCELLED; gói đã trả tiền yêu cầu benefit GRANTED.
CREATE OR REPLACE FUNCTION fithub_membership_payment_consistent() RETURNS trigger LANGUAGE plpgsql AS $$
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
    IF payment_row."status" IS DISTINCT FROM 'CONFIRMED' OR payment_row."benefitStatus" <> 'GRANTED' THEN
      RAISE EXCEPTION 'Paid membership requires a confirmed payment with granted benefit' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF payment_row."status" = 'CONFIRMED' THEN
    IF payment_row."amount" <> membership_row."priceSnapshot" THEN
      RAISE EXCEPTION 'Confirmed payment and membership are inconsistent' USING ERRCODE = '23514';
    END IF;
    IF membership_row."status" NOT IN ('SCHEDULED', 'ACTIVE', 'FROZEN', 'EXPIRED')
       AND NOT (payment_row."benefitStatus" IN ('NEEDS_REVIEW', 'NONE')
                AND membership_row."status" IN ('PENDING_PAYMENT', 'CANCELLED')) THEN
      RAISE EXCEPTION 'Confirmed payment and membership are inconsistent' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;

-- 4. Lịch sử Payment: khoản đã xác nhận vẫn bất biến. Admin đang hoạt động và hội viên đang
-- hoạt động chỉ bắt buộc với thu tại quầy; tiền VNPay đã vào thì luôn phải ghi nhận được
-- (quyền lợi xử lý ở bước đối soát).
CREATE OR REPLACE FUNCTION fithub_payment_history() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF NEW."status" = 'CONFIRMED' AND (TG_OP = 'INSERT' OR OLD."status" <> 'CONFIRMED') AND NEW."method" <> 'VNPAY' THEN
    IF NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."confirmedById" AND "role" = 'ADMIN' AND "status" = 'ACTIVE') THEN
      RAISE EXCEPTION 'Counter confirmation requires an active admin' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "Membership" m JOIN "MemberProfile" p ON p."id" = m."memberId" JOIN "User" u ON u."id" = p."userId"
      WHERE m."id" = NEW."membershipId" AND u."role" = 'MEMBER' AND u."status" = 'ACTIVE' AND u."verifiedAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'Counter confirmation requires an active verified member' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
