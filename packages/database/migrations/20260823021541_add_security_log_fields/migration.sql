-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "success" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "userAgent" TEXT,
ALTER COLUMN "companyId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
