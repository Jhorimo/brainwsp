/*
  Warnings:

  - You are about to drop the column `pipelineId` on the `Deal` table. All the data in the column will be lost.
  - You are about to drop the `DealStage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Pipeline` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `departmentId` to the `Deal` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Deal" DROP CONSTRAINT "Deal_pipelineId_fkey";

-- DropForeignKey
ALTER TABLE "Deal" DROP CONSTRAINT "Deal_stageId_fkey";

-- DropForeignKey
ALTER TABLE "DealStage" DROP CONSTRAINT "DealStage_companyId_fkey";

-- DropForeignKey
ALTER TABLE "DealStage" DROP CONSTRAINT "DealStage_pipelineId_fkey";

-- DropForeignKey
ALTER TABLE "Pipeline" DROP CONSTRAINT "Pipeline_companyId_fkey";

-- DropIndex
DROP INDEX "Deal_companyId_pipelineId_stageId_idx";

-- AlterTable
ALTER TABLE "Deal" DROP COLUMN "pipelineId",
ADD COLUMN     "departmentId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "departmentId" TEXT;

-- AlterTable
ALTER TABLE "PipelineStage" ADD COLUMN     "isWon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "DealStage";

-- DropTable
DROP TABLE "Pipeline";

-- CreateIndex
CREATE INDEX "Deal_companyId_departmentId_stageId_idx" ON "Deal"("companyId", "departmentId", "stageId");

-- CreateIndex
CREATE INDEX "Lead_companyId_departmentId_idx" ON "Lead"("companyId", "departmentId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
