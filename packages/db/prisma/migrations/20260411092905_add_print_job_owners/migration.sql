-- CreateTable
CREATE TABLE "PrintJobOwner" (
    "userId" TEXT NOT NULL,
    "printJobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintJobOwner_pkey" PRIMARY KEY ("userId","printJobId")
);

-- CreateIndex
CREATE INDEX "PrintJobOwner_printJobId_idx" ON "PrintJobOwner"("printJobId");

-- AddForeignKey
ALTER TABLE "PrintJobOwner" ADD CONSTRAINT "PrintJobOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJobOwner" ADD CONSTRAINT "PrintJobOwner_printJobId_fkey" FOREIGN KEY ("printJobId") REFERENCES "PrintJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
