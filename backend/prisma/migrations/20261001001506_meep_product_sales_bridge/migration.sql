/*
  Warnings:

  - A unique constraint covering the columns `[storeId,meepBusinessDay]` on the table `ProductSalesImport` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ProductSalesImportOrigem" AS ENUM ('MANUAL', 'MEEP');

-- AlterTable
ALTER TABLE "ProductSalesImport" ADD COLUMN     "meepBusinessDay" TEXT,
ADD COLUMN     "origem" "ProductSalesImportOrigem" NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE UNIQUE INDEX "ProductSalesImport_storeId_meepBusinessDay_key" ON "ProductSalesImport"("storeId", "meepBusinessDay");
