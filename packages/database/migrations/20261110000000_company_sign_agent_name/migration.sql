-- Firma con el nombre del agente en los mensajes enviados (apagado por defecto).
ALTER TABLE "Company" ADD COLUMN "signAgentName" BOOLEAN NOT NULL DEFAULT false;
