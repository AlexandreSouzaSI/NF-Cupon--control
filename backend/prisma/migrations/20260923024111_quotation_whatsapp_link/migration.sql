-- AlterTable
ALTER TABLE "WhatsappOutboundMessage" ADD COLUMN     "quotationSupplierId" TEXT;

-- CreateIndex
CREATE INDEX "WhatsappOutboundMessage_quotationSupplierId_idx" ON "WhatsappOutboundMessage"("quotationSupplierId");

-- AddForeignKey
ALTER TABLE "WhatsappOutboundMessage" ADD CONSTRAINT "WhatsappOutboundMessage_quotationSupplierId_fkey" FOREIGN KEY ("quotationSupplierId") REFERENCES "QuotationSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
