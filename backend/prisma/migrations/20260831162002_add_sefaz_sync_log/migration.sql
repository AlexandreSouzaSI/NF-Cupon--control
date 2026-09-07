-- CreateTable
CREATE TABLE "SefazSyncLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "fetchedTotal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SefazSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SefazSyncLog_storeId_source_createdAt_idx" ON "SefazSyncLog"("storeId", "source", "createdAt");

-- AddForeignKey
ALTER TABLE "SefazSyncLog" ADD CONSTRAINT "SefazSyncLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
