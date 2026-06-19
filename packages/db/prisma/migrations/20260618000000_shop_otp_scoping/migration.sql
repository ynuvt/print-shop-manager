-- Add display name and location fields to PrintShop
ALTER TABLE "PrintShop" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PrintShop" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "PrintShop" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

-- Drop the old global unique constraint on verificationCode
DROP INDEX IF EXISTS "PrintJob_verificationCode_key";

-- Add per-shop unique constraint: same OTP can exist in different shops
-- NULL verificationCode rows are all distinct in Postgres unique indexes, so DRAFT jobs are fine
CREATE UNIQUE INDEX IF NOT EXISTS "printjob_code_shop_unique" ON "PrintJob"("verificationCode", "shopId");
