-- AlterTable
ALTER TABLE "User" ADD COLUMN     "moduleAccess" "StoreModule"[] DEFAULT ARRAY[]::"StoreModule"[],
ADD COLUMN     "canViewPayrollBills" BOOLEAN NOT NULL DEFAULT true;
