-- AlterEnum
ALTER TYPE "PaymentRequestStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "PaymentRequest" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "previousLicenseRenewsAt" TIMESTAMP(3),
ADD COLUMN     "previousPlanId" TEXT,
ADD COLUMN     "previousPlanStartedAt" TIMESTAMP(3);
