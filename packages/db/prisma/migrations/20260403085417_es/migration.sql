/*
  Warnings:

  - A unique constraint covering the columns `[phoneNumber]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Source" AS ENUM ('WEB', 'WHATSAPP');

-- AlterEnum
ALTER TYPE "PrintJobStatus" ADD VALUE 'DRAFT';

-- DropForeignKey
ALTER TABLE "PrintJob" DROP CONSTRAINT "printjob_userId_fkey";

-- AlterTable
ALTER TABLE "PrintJob" ADD COLUMN     "source" "Source" NOT NULL DEFAULT 'WEB',
ADD COLUMN     "userMetadata" JSONB,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "name" TEXT,
ADD COLUMN     "phoneNumber" TEXT;

-- AlterTable
ALTER TABLE "file" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "mimeType" TEXT NOT NULL DEFAULT 'application/pdf';

-- AlterTable
ALTER TABLE "printOption" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "printjob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
