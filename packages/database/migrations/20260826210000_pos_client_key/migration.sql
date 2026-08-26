-- Varias instalaciones de BrainPOS pueden estar publicadas bajo la misma IP/dominio.
-- El identificador legacy debe combinar ese origen con el teléfono del dispositivo para
-- que cada cliente reciba una instancia y un APP KEY propios.
ALTER TABLE "WhatsAppInstance" ADD COLUMN "posClientKey" TEXT;

UPDATE "WhatsAppInstance"
SET "posClientKey" = "posWebhookUrl" || '|' || regexp_replace(COALESCE("phoneNumber", ''), '[^0-9]', '', 'g')
WHERE "posWebhookUrl" IS NOT NULL;

DROP INDEX "WhatsAppInstance_companyId_posWebhookUrl_key";

CREATE UNIQUE INDEX "WhatsAppInstance_companyId_posClientKey_key"
ON "WhatsAppInstance"("companyId", "posClientKey");
