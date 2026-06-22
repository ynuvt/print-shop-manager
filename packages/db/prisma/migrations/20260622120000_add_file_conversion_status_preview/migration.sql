-- CreateEnum
CREATE TYPE "FileConversionStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "file"
  ADD COLUMN "previewUrl" TEXT,
  ADD COLUMN "conversionStatus" "FileConversionStatus" NOT NULL DEFAULT 'READY',
  ALTER COLUMN "url" SET DEFAULT '';
