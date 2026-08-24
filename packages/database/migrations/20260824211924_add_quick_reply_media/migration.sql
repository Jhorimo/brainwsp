-- AlterTable
ALTER TABLE "QuickReply" ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "mediaUrl" TEXT,
ADD COLUMN     "mimeType" TEXT,
ALTER COLUMN "content" DROP NOT NULL;
