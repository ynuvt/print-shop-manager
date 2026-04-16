/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `WhatsAppUser` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "WhatsAppUser" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "WhatsAppLoginOtp" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppLoginOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppLoginOtp_code_key" ON "WhatsAppLoginOtp"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppUser_userId_key" ON "WhatsAppUser"("userId");

-- AddForeignKey
ALTER TABLE "WhatsAppUser" ADD CONSTRAINT "whatsappuser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppLoginOtp" ADD CONSTRAINT "whatsapploginotp_phoneNumber_fkey" FOREIGN KEY ("phoneNumber") REFERENCES "WhatsAppUser"("phoneNumber") ON DELETE CASCADE ON UPDATE CASCADE;
