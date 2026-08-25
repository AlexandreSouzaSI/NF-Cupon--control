-- CreateTable
CREATE TABLE "ProductLoss" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" TEXT,
    "reason" TEXT,
    "photoUrl" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductLoss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductLoss_storeId_idx" ON "ProductLoss"("storeId");

-- CreateIndex
CREATE INDEX "ProductLoss_occurredAt_idx" ON "ProductLoss"("occurredAt");

-- AddForeignKey
ALTER TABLE "ProductLoss" ADD CONSTRAINT "ProductLoss_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLoss" ADD CONSTRAINT "ProductLoss_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
