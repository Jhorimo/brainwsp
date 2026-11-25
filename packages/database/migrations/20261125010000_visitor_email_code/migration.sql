-- Clienera Chat: código de 6 dígitos por correo para volver al chat desde otro dispositivo.
-- Tabla nueva, no toca las existentes.
CREATE TABLE "VisitorEmailCode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorEmailCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VisitorEmailCode_sessionId_createdAt_idx" ON "VisitorEmailCode"("sessionId", "createdAt");
CREATE INDEX "VisitorEmailCode_contactId_createdAt_idx" ON "VisitorEmailCode"("contactId", "createdAt");
