-- AlterTable
ALTER TABLE "FiscalDocument" ADD COLUMN     "receiptId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseReceipt" ADD COLUMN     "finalValue" DECIMAL(10,2);

-- CreateIndex
CREATE INDEX "FiscalDocument_receiptId_idx" ON "FiscalDocument"("receiptId");

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
