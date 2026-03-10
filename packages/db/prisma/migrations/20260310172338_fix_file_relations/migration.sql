-- CreateEnum
CREATE TYPE "PaperSize" AS ENUM ('A4', 'A3', 'Letter', 'Legal');

-- CreateEnum
CREATE TYPE "ColorMode" AS ENUM ('BW', 'COLOR');

-- CreateEnum
CREATE TYPE "pageRange" AS ENUM ('ALL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "duplex" AS ENUM ('ONE', 'BOTH');

-- CreateTable
CREATE TABLE "printOption" (
    "id" TEXT NOT NULL,
    "paperSize" "PaperSize" NOT NULL DEFAULT 'A4',
    "colorMode" "ColorMode" NOT NULL DEFAULT 'BW',
    "pageRange" "pageRange" NOT NULL DEFAULT 'ALL',
    "customRange" TEXT,
    "duplex" "duplex" NOT NULL DEFAULT 'ONE',
    "copies" INTEGER NOT NULL,

    CONSTRAINT "printOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pages" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "printJobId" TEXT NOT NULL,

    CONSTRAINT "file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "totalPages" INTEGER NOT NULL,
    "estimatedTime" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "file_optionId_key" ON "file"("optionId");

-- AddForeignKey
ALTER TABLE "file" ADD CONSTRAINT "file_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "printOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file" ADD CONSTRAINT "file_printJobId_fkey" FOREIGN KEY ("printJobId") REFERENCES "PrintJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
