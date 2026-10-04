-- CreateTable
CREATE TABLE "HiddenProductDish" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "produtoChave" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenProductDish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HiddenProductDish_storeId_idx" ON "HiddenProductDish"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenProductDish_storeId_produtoChave_key" ON "HiddenProductDish"("storeId", "produtoChave");

-- AddForeignKey
ALTER TABLE "HiddenProductDish" ADD CONSTRAINT "HiddenProductDish_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
