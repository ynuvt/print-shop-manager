/*
  Warnings:

  - You are about to drop the `WhatsAppUserMetadata` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "WhatsAppUserMetadata" DROP CONSTRAINT "usermetadata_printJobId_fkey";

-- DropTable
DROP TABLE "WhatsAppUserMetadata";

-- CreateTable
CREATE TABLE "WhatsAppUser" (
    "phoneNumber" TEXT NOT NULL,
    "name" TEXT,
    "printJobId" TEXT NOT NULL,

    CONSTRAINT "WhatsAppUser_pkey" PRIMARY KEY ("phoneNumber")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppUser_printJobId_key" ON "WhatsAppUser"("printJobId");

-- AddForeignKey
ALTER TABLE "WhatsAppUser" ADD CONSTRAINT "usermetadata_printJobId_fkey" FOREIGN KEY ("printJobId") REFERENCES "PrintJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
