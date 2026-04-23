-- CreateEnum
CREATE TYPE "FileOwnerRole" AS ENUM ('OWNER', 'COLLABORATOR');

-- AlterTable
ALTER TABLE "file" ADD COLUMN     "fileCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "uploadedByDisplayName" TEXT,
ADD COLUMN     "uploadedByPhoneNumber" TEXT,
ADD COLUMN     "uploadedByRole" "FileOwnerRole" NOT NULL DEFAULT 'OWNER',
ADD COLUMN     "uploadedByUserId" TEXT;

-- Backfill ownership for existing rows
-- If a job has an owning web user, stamp that as the uploader.
UPDATE "file" f
SET "uploadedByUserId" = pj."userId",
    "uploadedByRole" = 'OWNER'
FROM "PrintJob" pj
WHERE f."printJobId" = pj."id"
  AND f."uploadedByUserId" IS NULL
  AND pj."userId" IS NOT NULL;

-- If a job is associated with a WhatsApp user, stamp that identity as the uploader.
UPDATE "file" f
SET "uploadedByPhoneNumber" = pj."userMetadataId",
    "uploadedByDisplayName" = wu."name",
    "uploadedByRole" = 'OWNER'
FROM "PrintJob" pj
LEFT JOIN "WhatsAppUser" wu
  ON wu."phoneNumber" = pj."userMetadataId"
WHERE f."printJobId" = pj."id"
  AND f."uploadedByPhoneNumber" IS NULL
  AND pj."userMetadataId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "file_printJobId_uploadedByUserId_idx" ON "file"("printJobId", "uploadedByUserId");

-- CreateIndex
CREATE INDEX "file_printJobId_uploadedByPhoneNumber_idx" ON "file"("printJobId", "uploadedByPhoneNumber");

-- AddForeignKey
ALTER TABLE "file" ADD CONSTRAINT "file_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file" ADD CONSTRAINT "file_uploadedByPhoneNumber_fkey" FOREIGN KEY ("uploadedByPhoneNumber") REFERENCES "WhatsAppUser"("phoneNumber") ON DELETE SET NULL ON UPDATE CASCADE;
