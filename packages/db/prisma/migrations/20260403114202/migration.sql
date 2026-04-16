/*
  Warnings:

  - You are about to drop the column `printJobId` on the `WhatsAppUser` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "WhatsAppUser" DROP CONSTRAINT "usermetadata_printJobId_fkey";

-- DropIndex
DROP INDEX "WhatsAppUser_printJobId_key";

-- AlterTable
ALTER TABLE "PrintJob" ADD COLUMN     "userMetadataId" TEXT;

-- AlterTable
ALTER TABLE "WhatsAppUser" DROP COLUMN "printJobId";

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "printjob_userMetadataId_fkey" FOREIGN KEY ("userMetadataId") REFERENCES "WhatsAppUser"("phoneNumber") ON DELETE SET NULL ON UPDATE CASCADE;
