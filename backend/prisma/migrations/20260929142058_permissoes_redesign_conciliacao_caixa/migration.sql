/*
  Warnings:

  - You are about to drop the `UserModulePermission` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "StoreModule" ADD VALUE 'CONCILIACAO_CAIXA';

-- DropForeignKey
ALTER TABLE "UserModulePermission" DROP CONSTRAINT "UserModulePermission_userId_fkey";

-- DropTable
DROP TABLE "UserModulePermission";

-- DropEnum
DROP TYPE "ModulePermissionLevel";
