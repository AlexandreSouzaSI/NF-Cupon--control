/*
  Warnings:

  - A unique constraint covering the columns `[activationToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[passwordResetToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WhatsappMessageKind" ADD VALUE 'ACCOUNT_ACTIVATION';
ALTER TYPE "WhatsappMessageKind" ADD VALUE 'PASSWORD_RESET';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountActivated" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "activationToken" TEXT,
ADD COLUMN     "activationTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetToken" TEXT,
ADD COLUMN     "passwordResetTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_activationToken_key" ON "User"("activationToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");
