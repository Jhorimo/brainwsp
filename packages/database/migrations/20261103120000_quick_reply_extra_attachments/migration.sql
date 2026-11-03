-- Adjuntos extra (2.º en adelante) de una respuesta rápida. Nullable: no toca las existentes.
ALTER TABLE "QuickReply" ADD COLUMN "extraAttachments" JSONB;
