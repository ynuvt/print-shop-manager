/*
  Warnings:

  - The `status` column on the `PrintJob` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `verificationCode` column on the `PrintJob` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED');

-- AlterTable
ALTER TABLE "PrintJob" DROP COLUMN "status",
ADD COLUMN     "status" "PrintJobStatus" NOT NULL DEFAULT 'PROCESSING',
DROP COLUMN "verificationCode",
ADD COLUMN     "verificationCode" SERIAL NOT NULL;
