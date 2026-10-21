-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "adAt" TIMESTAMP(3),
ADD COLUMN     "adSourceId" TEXT,
ADD COLUMN     "adSourceUrl" TEXT,
ADD COLUMN     "adTitle" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_companyId_adAt_idx" ON "Conversation"("companyId", "adAt");
