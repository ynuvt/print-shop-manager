-- AlterTable
ALTER TABLE "PrintJob" ADD COLUMN     "shopId" TEXT;

-- CreateTable
CREATE TABLE "PrintShop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shopCode" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintShop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrintShop_shopCode_key" ON "PrintShop"("shopCode");

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "printjob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PrintShop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
