-- CreateEnum
CREATE TYPE "FlowTriggerType" AS ENUM ('KEYWORD');

-- CreateEnum
CREATE TYPE "FlowExecutionStatus" AS ENUM ('RUNNING', 'WAITING_INPUT', 'WAITING_TIMER', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "FlowFolder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "triggerType" "FlowTriggerType" NOT NULL DEFAULT 'KEYWORD',
    "triggerKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "graph" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowExecution" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "currentNodeId" TEXT,
    "status" "FlowExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "context" JSONB NOT NULL DEFAULT '{}',
    "waitingUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlowExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlowFolder_companyId_idx" ON "FlowFolder"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowFolder_companyId_name_key" ON "FlowFolder"("companyId", "name");

-- CreateIndex
CREATE INDEX "Flow_companyId_active_idx" ON "Flow"("companyId", "active");

-- CreateIndex
CREATE INDEX "Flow_instanceId_idx" ON "Flow"("instanceId");

-- CreateIndex
CREATE INDEX "Flow_folderId_idx" ON "Flow"("folderId");

-- CreateIndex
CREATE INDEX "FlowExecution_companyId_idx" ON "FlowExecution"("companyId");

-- CreateIndex
CREATE INDEX "FlowExecution_conversationId_status_idx" ON "FlowExecution"("conversationId", "status");

-- AddForeignKey
ALTER TABLE "FlowFolder" ADD CONSTRAINT "FlowFolder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "FlowFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowExecution" ADD CONSTRAINT "FlowExecution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowExecution" ADD CONSTRAINT "FlowExecution_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowExecution" ADD CONSTRAINT "FlowExecution_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
