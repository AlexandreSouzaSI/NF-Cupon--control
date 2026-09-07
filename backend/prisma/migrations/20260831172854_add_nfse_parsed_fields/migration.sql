-- AlterTable
ALTER TABLE "IncomingServiceNf" ADD COLUMN     "issueDate" TIMESTAMP(3),
ADD COLUMN     "issuerDoc" TEXT,
ADD COLUMN     "issuerName" TEXT,
ADD COLUMN     "numeroNf" TEXT,
ADD COLUMN     "value" DECIMAL(10,2);
