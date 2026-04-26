-- CreateTable
CREATE TABLE "MobileSyncOtp" (
    "id" TEXT NOT NULL,
    "syncId" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "userId" TEXT,
    "token" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileSyncOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobileSyncOtp_syncId_key" ON "MobileSyncOtp"("syncId");

-- CreateIndex
CREATE UNIQUE INDEX "MobileSyncOtp_otp_key" ON "MobileSyncOtp"("otp");
