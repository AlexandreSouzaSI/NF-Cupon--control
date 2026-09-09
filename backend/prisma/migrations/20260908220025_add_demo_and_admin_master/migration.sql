-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "demoExpiresAt" TIMESTAMP(3),
ADD COLUMN     "isAdminMaster" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signupIp" TEXT;
