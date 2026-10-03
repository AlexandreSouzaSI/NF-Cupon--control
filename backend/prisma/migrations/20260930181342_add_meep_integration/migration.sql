-- CreateTable
CREATE TABLE "MeepCredential" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "subscriptionKeyCipher" TEXT NOT NULL,
    "subscriptionKeyIv" TEXT NOT NULL,
    "subscriptionKeyAuthTag" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordCipher" TEXT NOT NULL,
    "passwordIv" TEXT NOT NULL,
    "passwordAuthTag" TEXT NOT NULL,
    "meepStoreId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSalesSyncedUntil" TIMESTAMP(3),
    "lastConciliationSyncedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeepCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeepSyncLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "rangeStart" TIMESTAMP(3) NOT NULL,
    "rangeEnd" TIMESTAMP(3) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "ordersFetched" INTEGER NOT NULL DEFAULT 0,
    "transactionsFetched" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeepSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeepOrder" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "meepOrderId" TEXT NOT NULL,
    "meepAccountId" TEXT,
    "orderType" INTEGER,
    "orderDateUtc" TIMESTAMP(3) NOT NULL,
    "statusCode" INTEGER,
    "status" TEXT,
    "customerDocument" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhoneNumber" TEXT,
    "customerIdentifier" TEXT,
    "paymentType" INTEGER,
    "posCode" TEXT,
    "posMacAddress" TEXT,
    "cashierId" TEXT,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "value" DECIMAL(12,2) NOT NULL,
    "lastSyncedFrom" TEXT NOT NULL,
    "rawJson" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeepOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeepOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "meepItemId" TEXT,
    "productId" TEXT NOT NULL,
    "productType" INTEGER,
    "productName" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitValue" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "addition" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "insurance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2),
    "ncm" TEXT,
    "cfop" TEXT,

    CONSTRAINT "MeepOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeepOrderPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "meepPaymentId" TEXT,
    "typeId" INTEGER,
    "type" TEXT,
    "value" DECIMAL(12,2) NOT NULL,
    "receiptDate" TIMESTAMP(3),
    "nsu" TEXT,
    "authorizationNumber" TEXT,
    "cardBannerName" TEXT,

    CONSTRAINT "MeepOrderPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeepConciliationTransaction" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "meepTransactionId" TEXT NOT NULL,
    "meepOrderId" TEXT,
    "createdOn" TIMESTAMP(3) NOT NULL,
    "createdOnBr" TEXT,
    "authorizationNumber" TEXT,
    "grossValue" DECIMAL(12,2) NOT NULL,
    "ratePercentage" DECIMAL(7,4),
    "rateValue" DECIMAL(12,2),
    "rateValueAdvance" DECIMAL(12,2),
    "netValue" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "installments" INTEGER,
    "paymentTypeId" INTEGER,
    "paymentTypeName" TEXT,
    "cardFlagId" INTEGER,
    "cardFlagName" TEXT,
    "pointOfSaleName" TEXT,
    "rawJson" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeepConciliationTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeepCredential_storeId_key" ON "MeepCredential"("storeId");

-- CreateIndex
CREATE INDEX "MeepSyncLog_storeId_endpoint_createdAt_idx" ON "MeepSyncLog"("storeId", "endpoint", "createdAt");

-- CreateIndex
CREATE INDEX "MeepOrder_storeId_orderDateUtc_idx" ON "MeepOrder"("storeId", "orderDateUtc");

-- CreateIndex
CREATE UNIQUE INDEX "MeepOrder_storeId_meepOrderId_key" ON "MeepOrder"("storeId", "meepOrderId");

-- CreateIndex
CREATE INDEX "MeepOrderItem_orderId_idx" ON "MeepOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "MeepOrderPayment_orderId_idx" ON "MeepOrderPayment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "MeepConciliationTransaction_meepTransactionId_key" ON "MeepConciliationTransaction"("meepTransactionId");

-- CreateIndex
CREATE INDEX "MeepConciliationTransaction_storeId_createdOn_idx" ON "MeepConciliationTransaction"("storeId", "createdOn");

-- AddForeignKey
ALTER TABLE "MeepCredential" ADD CONSTRAINT "MeepCredential_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeepSyncLog" ADD CONSTRAINT "MeepSyncLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeepOrder" ADD CONSTRAINT "MeepOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeepOrderItem" ADD CONSTRAINT "MeepOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MeepOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeepOrderPayment" ADD CONSTRAINT "MeepOrderPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MeepOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeepConciliationTransaction" ADD CONSTRAINT "MeepConciliationTransaction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
