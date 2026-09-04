-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "moduleOverrides" TEXT[] DEFAULT ARRAY[]::TEXT[];
