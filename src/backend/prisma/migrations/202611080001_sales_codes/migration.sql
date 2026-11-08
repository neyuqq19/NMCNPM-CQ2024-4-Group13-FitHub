CREATE SEQUENCE fithub_membership_code_seq;
SELECT setval('fithub_membership_code_seq', GREATEST(COALESCE((SELECT MAX(substring("code" from 3)::bigint) FROM "Membership" WHERE "code" ~ '^DK[0-9]+$'),0)+1,1), false);
CREATE SEQUENCE fithub_payment_code_seq;
SELECT setval('fithub_payment_code_seq', GREATEST(COALESCE((SELECT MAX(substring("code" from 3)::bigint) FROM "Payment" WHERE "code" ~ '^GD[0-9]+$'),0)+1,1), false);
CREATE INDEX "Payment_createdAt_id_idx" ON "Payment"("createdAt","id");
