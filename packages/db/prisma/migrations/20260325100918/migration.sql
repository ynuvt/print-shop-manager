-- CreateEnum
CREATE TYPE "orientation" AS ENUM ('PORTRAIT', 'LANDSCAPE');

-- CreateEnum
CREATE TYPE "scaleMode" AS ENUM ('FIT', 'SHRINK', 'NOSCALE');

-- AlterTable
ALTER TABLE "printOption" ADD COLUMN     "orientation" "orientation" NOT NULL DEFAULT 'PORTRAIT',
ADD COLUMN     "scaleMode" "scaleMode" NOT NULL DEFAULT 'FIT';
