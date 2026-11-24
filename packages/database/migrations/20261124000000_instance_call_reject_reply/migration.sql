-- Mensaje opcional después de rechazar una llamada de WhatsApp desde el panel (aditivo).
ALTER TABLE "WhatsAppInstance" ADD COLUMN "callRejectAutoReply" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WhatsAppInstance" ADD COLUMN "callRejectMessage" TEXT;
