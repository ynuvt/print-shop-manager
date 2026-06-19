-- AlterTable
ALTER TABLE "PrintShop" ADD COLUMN     "landmark" TEXT,
ADD COLUMN     "priceBW" DOUBLE PRECISION NOT NULL DEFAULT 2,
ADD COLUMN     "priceColor" DOUBLE PRECISION NOT NULL DEFAULT 7;

-- RenameIndex
ALTER INDEX "printjob_code_shop_unique" RENAME TO "PrintJob_verificationCode_shopId_key";
