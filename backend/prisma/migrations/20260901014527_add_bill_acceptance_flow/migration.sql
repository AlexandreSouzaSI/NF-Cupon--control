-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "categoryId" TEXT;

-- AlterTable
ALTER TABLE "IncomingGoodsNf" ADD COLUMN     "accepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billId" TEXT;

-- AlterTable
ALTER TABLE "IncomingServiceNf" ADD COLUMN     "accepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billId" TEXT,
ADD COLUMN     "ignored" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BillCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillCategory_nameNormalized_key" ON "BillCategory"("nameNormalized");

-- CreateIndex
CREATE INDEX "Bill_categoryId_idx" ON "Bill"("categoryId");

-- CreateIndex
CREATE INDEX "IncomingGoodsNf_billId_idx" ON "IncomingGoodsNf"("billId");

-- CreateIndex
CREATE INDEX "IncomingServiceNf_billId_idx" ON "IncomingServiceNf"("billId");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BillCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingServiceNf" ADD CONSTRAINT "IncomingServiceNf_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingGoodsNf" ADD CONSTRAINT "IncomingGoodsNf_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
