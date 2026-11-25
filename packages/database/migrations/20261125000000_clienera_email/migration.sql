-- Clienera Chat: servidor de correo configurable por el superadmin y avisos por correo al
-- visitante. Solo agrega columnas con valor por defecto o NULL (compatible con la versión
-- anterior durante el rolling deploy).
ALTER TABLE "SystemSettings" ADD COLUMN "smtpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemSettings" ADD COLUMN "smtpHost" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "smtpPort" INTEGER;
ALTER TABLE "SystemSettings" ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemSettings" ADD COLUMN "smtpUser" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "smtpPassEnc" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "mailFromEmail" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "mailFromName" TEXT;

ALTER TABLE "Contact" ADD COLUMN "emailNotify" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Conversation" ADD COLUMN "lastEmailNotifiedAt" TIMESTAMP(3);
