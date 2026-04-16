/*
  Warnings:

  - You are about to drop the column `userMetadata` on the `PrintJob` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PrintJob" DROP COLUMN "userMetadata";

-- CreateTable
CREATE TABLE "WhatsAppUserMetadata" (
    "phoneNumber" TEXT NOT NULL,
    "name" TEXT,
    "printJobId" TEXT NOT NULL,

    CONSTRAINT "WhatsAppUserMetadata_pkey" PRIMARY KEY ("phoneNumber")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppUserMetadata_printJobId_key" ON "WhatsAppUserMetadata"("printJobId");

-- AddForeignKey
ALTER TABLE "WhatsAppUserMetadata" ADD CONSTRAINT "usermetadata_printJobId_fkey" FOREIGN KEY ("printJobId") REFERENCES "PrintJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
