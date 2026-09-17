-- CreateEnum
CREATE TYPE "IngredientUnidade" AS ENUM ('KG', 'UNIDADE');

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "pesoUnidadeGramas" DECIMAL(10,2),
ADD COLUMN     "unidadeMedida" "IngredientUnidade" NOT NULL DEFAULT 'KG';
