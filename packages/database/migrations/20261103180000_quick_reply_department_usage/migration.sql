-- Respuestas rápidas por departamento (null = todas) y contador de uso para ordenar por las más usadas.
ALTER TABLE "QuickReply" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "QuickReply" ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QuickReply" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "QuickReply" ADD CONSTRAINT "QuickReply_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
