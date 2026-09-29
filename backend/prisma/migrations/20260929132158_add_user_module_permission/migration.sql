-- CreateEnum
CREATE TYPE "ModulePermissionLevel" AS ENUM ('VER', 'EDITAR', 'APROVAR');

-- CreateTable
CREATE TABLE "UserModulePermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" "StoreModule" NOT NULL,
    "level" "ModulePermissionLevel" NOT NULL DEFAULT 'EDITAR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserModulePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserModulePermission_userId_idx" ON "UserModulePermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserModulePermission_userId_module_key" ON "UserModulePermission"("userId", "module");

-- AddForeignKey
ALTER TABLE "UserModulePermission" ADD CONSTRAINT "UserModulePermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
