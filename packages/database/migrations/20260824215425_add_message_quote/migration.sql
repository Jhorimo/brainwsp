-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "quotedMessageId" TEXT;

-- CreateIndex
CREATE INDEX "Message_quotedMessageId_idx" ON "Message"("quotedMessageId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_quotedMessageId_fkey" FOREIGN KEY ("quotedMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
