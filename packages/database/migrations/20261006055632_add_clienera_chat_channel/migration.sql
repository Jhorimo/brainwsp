-- AlterEnum
ALTER TYPE "WhatsAppProvider" ADD VALUE 'CLIENERA_CHAT';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "source" TEXT,
ADD COLUMN     "visitorId" TEXT;

-- AlterTable
ALTER TABLE "WhatsAppInstance" ADD COLUMN     "configuration" JSONB,
ADD COLUMN     "widgetPublicKey" TEXT;

-- CreateTable
CREATE TABLE "VisitorSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitorSession_tokenHash_key" ON "VisitorSession"("tokenHash");

-- CreateIndex
CREATE INDEX "VisitorSession_companyId_idx" ON "VisitorSession"("companyId");

-- CreateIndex
CREATE INDEX "VisitorSession_contactId_idx" ON "VisitorSession"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_visitorId_key" ON "Contact"("visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppInstance_widgetPublicKey_key" ON "WhatsAppInstance"("widgetPublicKey");

-- AddForeignKey
ALTER TABLE "VisitorSession" ADD CONSTRAINT "VisitorSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorSession" ADD CONSTRAINT "VisitorSession_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
