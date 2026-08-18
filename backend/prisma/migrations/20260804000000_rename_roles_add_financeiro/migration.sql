-- AlterEnum
-- Renomeia os valores existentes do enum UserRole preservando os dados já
-- gravados (RENAME VALUE não altera as linhas, só o rótulo do valor).
ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'ADMINISTRATIVO';
ALTER TYPE "UserRole" RENAME VALUE 'OWNER' TO 'PROPRIETARIO';
ALTER TYPE "UserRole" RENAME VALUE 'MANAGER' TO 'GERENTE';
ALTER TYPE "UserRole" RENAME VALUE 'BUYER' TO 'COMPRADOR';
ALTER TYPE "UserRole" RENAME VALUE 'STOCKIST' TO 'ESTOQUISTA';

-- AlterEnum
-- Novo perfil, sem equivalente anterior.
ALTER TYPE "UserRole" ADD VALUE 'FINANCEIRO';
