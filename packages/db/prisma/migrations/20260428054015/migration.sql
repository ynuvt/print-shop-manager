/*
  Warnings:

  - A unique constraint covering the columns `[verificationCode]` on the table `PrintJob` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PrintJob_verificationCode_key" ON "PrintJob"("verificationCode");
