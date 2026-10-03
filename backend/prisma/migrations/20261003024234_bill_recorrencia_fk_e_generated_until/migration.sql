/*
  Warnings:

  - You are about to drop the column `lastGeneratedAt` on the `BillRecorrencia` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[recorrenciaId,dueDate]` on the table `Bill` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "recorrenciaId" TEXT;

-- AlterTable
ALTER TABLE "BillRecorrencia" DROP COLUMN "lastGeneratedAt",
ADD COLUMN     "generatedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Bill_recorrenciaId_dueDate_key" ON "Bill"("recorrenciaId", "dueDate");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId") REFERENCES "BillRecorrencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
