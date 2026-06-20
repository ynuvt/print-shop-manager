-- Add defaultShopId to WhatsAppUser so the bot can remember which shop a user selected via QR scan (SID:X command)
ALTER TABLE "WhatsAppUser" ADD COLUMN "defaultShopId" TEXT;
