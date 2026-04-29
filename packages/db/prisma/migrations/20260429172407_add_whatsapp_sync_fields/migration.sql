-- AlterTable
ALTER TABLE "WhatsAppUser" ADD COLUMN     "lastFileBatchSentAt" TIMESTAMP(3),
ADD COLUMN     "lastUploadStickerSentAt" TIMESTAMP(3);
