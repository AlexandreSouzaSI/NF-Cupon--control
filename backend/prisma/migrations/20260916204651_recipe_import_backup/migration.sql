-- CreateTable
CREATE TABLE "ProductRecipeImportBackup" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductRecipeImportBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecipeImportBackup_storeId_key" ON "ProductRecipeImportBackup"("storeId");

-- AddForeignKey
ALTER TABLE "ProductRecipeImportBackup" ADD CONSTRAINT "ProductRecipeImportBackup_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
