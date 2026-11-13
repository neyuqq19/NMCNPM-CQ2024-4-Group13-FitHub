/*
  Warnings:

  - A unique constraint covering the columns `[vnpTxnRef]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'FAILED');

-- CreateEnum
CREATE TYPE "BenefitStatus" AS ENUM ('GRANTED', 'NEEDS_REVIEW', 'NONE');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('RECONCILED', 'MISMATCHED', 'NONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'BANK_TRANSFER';
ALTER TYPE "PaymentMethod" ADD VALUE 'VNPAY';

-- AlterTable
ALTER TABLE "Equipment" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EquipmentHistory" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EquipmentIncident" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "benefitStatus" "BenefitStatus" NOT NULL DEFAULT 'GRANTED',
ADD COLUMN     "reconciliationStatus" "ReconciliationStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "vnpTransactionNo" TEXT,
ADD COLUMN     "vnpTxnRef" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "paymentId" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_code_key" ON "Invoice"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_paymentId_key" ON "Invoice"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_vnpTxnRef_key" ON "Payment"("vnpTxnRef");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
