-- Clienera Chat: un solo chat por correo y avisos de presencia para los agentes.
-- Solo agrega columnas NULL y una tabla nueva (compatible con la versión anterior).
ALTER TABLE "VisitorSession" ADD COLUMN "via" TEXT;
ALTER TABLE "VisitorSession" ADD COLUMN "historyFrom" TIMESTAMP(3);

CREATE TABLE "ConversationEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConversationEvent_conversationId_createdAt_idx" ON "ConversationEvent"("conversationId", "createdAt");
