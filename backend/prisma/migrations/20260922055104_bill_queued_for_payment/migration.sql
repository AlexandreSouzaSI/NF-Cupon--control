-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "queuedForPaymentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Bill_queuedForPaymentAt_idx" ON "Bill"("queuedForPaymentAt");
