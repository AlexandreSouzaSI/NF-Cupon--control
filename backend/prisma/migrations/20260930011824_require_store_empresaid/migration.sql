/*
  Warnings:

  - Made the column `empresaId` on table `Store` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Store" DROP CONSTRAINT "Store_empresaId_fkey";

-- AlterTable
ALTER TABLE "Store" ALTER COLUMN "empresaId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
