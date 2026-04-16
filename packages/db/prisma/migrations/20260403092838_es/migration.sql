/*
  Warnings:

  - You are about to drop the column `optionId` on the `file` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[fileId]` on the table `printOption` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fileId` to the `printOption` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "file" DROP CONSTRAINT "file_optionId_fkey";

-- DropForeignKey
ALTER TABLE "file" DROP CONSTRAINT "file_printJobId_fkey";

-- DropIndex
DROP INDEX "file_optionId_key";

-- AlterTable
ALTER TABLE "file" DROP COLUMN "optionId";

-- AlterTable
ALTER TABLE "printOption" ADD COLUMN     "fileId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "printOption_fileId_key" ON "printOption"("fileId");

-- AddForeignKey
ALTER TABLE "printOption" ADD CONSTRAINT "printoption_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file" ADD CONSTRAINT "file_printJobId_fkey" FOREIGN KEY ("printJobId") REFERENCES "PrintJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
