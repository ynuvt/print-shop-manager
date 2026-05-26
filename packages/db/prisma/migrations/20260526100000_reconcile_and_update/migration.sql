-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('COUPON', 'ADVERTISEMENT');

-- DropForeignKey
ALTER TABLE "Advertisement" DROP CONSTRAINT "Advertisement_brandId_fkey";

-- DropForeignKey
ALTER TABLE "PrintJob" DROP CONSTRAINT "printjob_shopId_fkey";

-- DropForeignKey
ALTER TABLE "WhatsAppTemplate" DROP CONSTRAINT "WhatsAppTemplate_brandId_fkey";

-- DropIndex
DROP INDEX "PrintShop_shopCode_key";

-- AlterTable
ALTER TABLE "BrandOffer" ADD COLUMN     "campaignType" "CampaignType" NOT NULL DEFAULT 'COUPON';

-- AlterTable
ALTER TABLE "PrintShop" DROP COLUMN "address",
DROP COLUMN "name",
DROP COLUMN "shopCode",
ADD COLUMN     "password" TEXT NOT NULL,
ADD COLUMN     "shopId" TEXT NOT NULL,
ADD COLUMN     "username" TEXT NOT NULL;

-- DropTable
DROP TABLE "Advertisement";

-- DropTable
DROP TABLE "WhatsAppTemplate";

-- CreateIndex
CREATE UNIQUE INDEX "PrintShop_username_key" ON "PrintShop"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PrintShop_shopId_key" ON "PrintShop"("shopId");

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "printjob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PrintShop"("shopId") ON DELETE SET NULL ON UPDATE CASCADE;
