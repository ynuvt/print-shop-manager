-- AlterTable
ALTER TABLE "PrintJob" ADD COLUMN     "expired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "oldOtp" INTEGER;
