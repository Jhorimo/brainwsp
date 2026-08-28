-- A flow can now apply to more than one WhatsApp instance ("Compartir" in the panel), so
-- `Flow.instanceId` (a single required FK) becomes a many-to-many join table instead. The
-- backfill INSERT runs between creating the join table and dropping the old column so every
-- existing flow keeps pointing at the bot it already had.

-- CreateTable
CREATE TABLE "_FlowToWhatsAppInstance" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FlowToWhatsAppInstance_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_FlowToWhatsAppInstance_B_index" ON "_FlowToWhatsAppInstance"("B");

-- AddForeignKey
ALTER TABLE "_FlowToWhatsAppInstance" ADD CONSTRAINT "_FlowToWhatsAppInstance_A_fkey" FOREIGN KEY ("A") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FlowToWhatsAppInstance" ADD CONSTRAINT "_FlowToWhatsAppInstance_B_fkey" FOREIGN KEY ("B") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing flow keeps its current bot as a linked instance.
INSERT INTO "_FlowToWhatsAppInstance" ("A", "B")
SELECT "id", "instanceId" FROM "Flow" WHERE "instanceId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Flow" DROP CONSTRAINT "Flow_instanceId_fkey";

-- DropIndex
DROP INDEX "Flow_instanceId_idx";

-- AlterTable
ALTER TABLE "Flow" DROP COLUMN "instanceId";
