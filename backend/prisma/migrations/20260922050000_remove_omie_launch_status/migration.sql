-- DropIndex
DROP INDEX "Bill_externalLaunchStatus_idx";

-- AlterTable
ALTER TABLE "Bill" DROP COLUMN "externalLaunchStatus";
ALTER TABLE "Bill" DROP COLUMN "externalSystemName";
ALTER TABLE "Bill" DROP COLUMN "externalCode";

-- DropEnum
DROP TYPE "ExternalLaunchStatus";
