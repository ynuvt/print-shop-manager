-- AlterTable
ALTER TABLE "PrintShop" ADD COLUMN "platformChargeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PlatformPayment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformPayment_shopId_idx" ON "PlatformPayment"("shopId");

-- AddForeignKey
ALTER TABLE "PlatformPayment" ADD CONSTRAINT "PlatformPayment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PrintShop"("shopId") ON DELETE RESTRICT ON UPDATE CASCADE;
