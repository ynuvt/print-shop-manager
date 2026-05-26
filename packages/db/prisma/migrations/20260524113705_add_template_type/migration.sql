/*
  Warnings:

  - You are about to drop the column `couponCode` on the `Advertisement` table. All the data in the column will be lost.
  - You are about to drop the column `discountType` on the `Advertisement` table. All the data in the column will be lost.
  - You are about to drop the column `discountValue` on the `Advertisement` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Advertisement" DROP COLUMN "couponCode",
DROP COLUMN "discountType",
DROP COLUMN "discountValue";

-- AlterTable
ALTER TABLE "WhatsAppTemplate" ADD COLUMN     "templateType" TEXT NOT NULL DEFAULT 'ADVERTISING';
