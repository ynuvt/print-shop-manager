-- AlterTable
ALTER TABLE "PrintJob" ALTER COLUMN "verificationCode" DROP NOT NULL,
ALTER COLUMN "verificationCode" DROP DEFAULT;
DROP SEQUENCE "PrintJob_verificationCode_seq";
