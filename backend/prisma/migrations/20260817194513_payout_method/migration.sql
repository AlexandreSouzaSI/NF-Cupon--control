/*
  Warnings:

  - The values [SALARIO,VALE,BONIFICACAO] on the enum `EmployeePaymentType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `paymentDate` on the `EmployeePayment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[employeeId,type,dueDate]` on the table `EmployeePayment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `dueDate` to the `EmployeePayment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('PIX', 'DINHEIRO', 'TRANSFERENCIA', 'BOLETO', 'OUTRO');

-- CreateEnum
CREATE TYPE "EmployeePaymentStatus" AS ENUM ('OPEN', 'PAID', 'CANCELED');

-- AlterEnum
BEGIN;
CREATE TYPE "EmployeePaymentType_new" AS ENUM ('ADIANTAMENTO', 'PAGAMENTO', 'VALE_TRANSPORTE', 'PREMIACAO', 'DECIMO_TERCEIRO', 'FERIAS', 'RESCISAO', 'OUTRO');
ALTER TABLE "EmployeePayment" ALTER COLUMN "type" TYPE "EmployeePaymentType_new" USING ("type"::text::"EmployeePaymentType_new");
ALTER TYPE "EmployeePaymentType" RENAME TO "EmployeePaymentType_old";
ALTER TYPE "EmployeePaymentType_new" RENAME TO "EmployeePaymentType";
DROP TYPE "public"."EmployeePaymentType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "EmployeePayment" DROP CONSTRAINT "EmployeePayment_createdById_fkey";

-- DropIndex
DROP INDEX "EmployeePayment_paymentDate_idx";

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "advanceDay" INTEGER,
ADD COLUMN     "advanceValue" DECIMAL(10,2),
ADD COLUMN     "bonusDay" INTEGER,
ADD COLUMN     "bonusValue" DECIMAL(10,2),
ADD COLUMN     "paymentDay" INTEGER,
ADD COLUMN     "paymentMethod" "PayoutMethod" NOT NULL DEFAULT 'PIX',
ADD COLUMN     "paymentValue" DECIMAL(10,2),
ADD COLUMN     "pixKey" TEXT,
ADD COLUMN     "pixKeyType" "PixKeyType",
ADD COLUMN     "salary" DECIMAL(10,2),
ADD COLUMN     "vtValue" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "EmployeePayment" DROP COLUMN "paymentDate",
ADD COLUMN     "dueDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "status" "EmployeePaymentStatus" NOT NULL DEFAULT 'OPEN',
ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "paymentMethod" "PayoutMethod" NOT NULL DEFAULT 'PIX',
ADD COLUMN     "pixKey" TEXT,
ADD COLUMN     "pixKeyType" "PixKeyType";

-- CreateIndex
CREATE INDEX "EmployeePayment_dueDate_idx" ON "EmployeePayment"("dueDate");

-- CreateIndex
CREATE INDEX "EmployeePayment_status_idx" ON "EmployeePayment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePayment_employeeId_type_dueDate_key" ON "EmployeePayment"("employeeId", "type", "dueDate");

-- AddForeignKey
ALTER TABLE "EmployeePayment" ADD CONSTRAINT "EmployeePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
