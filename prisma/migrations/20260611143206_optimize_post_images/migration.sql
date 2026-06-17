-- CreateEnum
CREATE TYPE "PostImageStorageType" AS ENUM ('LOCAL', 'REMOTE', 'EXTERNAL');

-- AlterTable
ALTER TABLE "PostImage" ADD COLUMN     "altText" TEXT,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "storageType" "PostImageStorageType" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "width" INTEGER;

-- CreateIndex
CREATE INDEX "PostImage_postId_sortOrder_idx" ON "PostImage"("postId", "sortOrder");

-- CreateIndex
CREATE INDEX "PostImage_storageType_idx" ON "PostImage"("storageType");
