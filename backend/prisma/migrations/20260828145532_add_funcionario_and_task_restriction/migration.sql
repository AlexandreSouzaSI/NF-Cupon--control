-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'FUNCIONARIO';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "restrictedFromAdministrativo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "restrictedFromGerente" BOOLEAN NOT NULL DEFAULT false;
