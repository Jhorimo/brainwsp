-- AlterTable
-- Dominio del cliente BrainPOS Restaurante que creó esta instancia vía POST
-- /api/user/device (ver UserDeviceService). Permite distinguir clientes cuando todos
-- comparten el mismo AUTH KEY "maestro" de la empresa.
ALTER TABLE "WhatsAppInstance" ADD COLUMN "posWebhookUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppInstance_companyId_posWebhookUrl_key" ON "WhatsAppInstance"("companyId", "posWebhookUrl");
