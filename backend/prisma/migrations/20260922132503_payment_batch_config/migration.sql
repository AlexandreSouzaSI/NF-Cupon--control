-- CreateTable
CREATE TABLE "PaymentBatchConfig" (
    "id" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL DEFAULT '748',
    "convenioCode" TEXT NOT NULL,
    "agencia" TEXT NOT NULL,
    "agenciaDv" TEXT,
    "conta" TEXT NOT NULL,
    "contaDv" TEXT,
    "companyName" TEXT NOT NULL,
    "companyCnpj" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PaymentBatchConfig_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PaymentBatchConfig" ADD CONSTRAINT "PaymentBatchConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
