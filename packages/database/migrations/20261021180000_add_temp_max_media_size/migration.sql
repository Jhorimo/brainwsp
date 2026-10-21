-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "tempMaxMediaSizeBytes" INTEGER,
ADD COLUMN     "tempMaxMediaSizeUntil" TIMESTAMP(3);
