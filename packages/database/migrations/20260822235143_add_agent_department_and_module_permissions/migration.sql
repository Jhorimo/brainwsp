-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowedModules" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Conversation_companyId_departmentId_idx" ON "Conversation"("companyId", "departmentId");
