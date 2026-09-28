-- CreateTable
CREATE TABLE "CashReconciliation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "systemCash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "systemDebit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "systemCredit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bankCash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bankDebit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bankCredit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "launchedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashReconciliation_storeId_idx" ON "CashReconciliation"("storeId");

-- CreateIndex
CREATE INDEX "CashReconciliation_date_idx" ON "CashReconciliation"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CashReconciliation_storeId_date_key" ON "CashReconciliation"("storeId", "date");

-- AddForeignKey
ALTER TABLE "CashReconciliation" ADD CONSTRAINT "CashReconciliation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashReconciliation" ADD CONSTRAINT "CashReconciliation_launchedById_fkey" FOREIGN KEY ("launchedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
