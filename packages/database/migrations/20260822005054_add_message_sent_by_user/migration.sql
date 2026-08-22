-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "sentByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Message_companyId_direction_createdAt_idx" ON "Message"("companyId", "direction", "createdAt");

-- CreateIndex
CREATE INDEX "Message_companyId_sentByUserId_createdAt_idx" ON "Message"("companyId", "sentByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
