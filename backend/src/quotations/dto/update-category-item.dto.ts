import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

// Edição do item já na lista — descrição manual (só faz sentido pra
// item avulso) e/ou o ajuste de quantidade sugerida.
export class UpdateCategoryItemDto {
    @IsOptional()
    @IsString()
    descricaoManual?: string;

    @IsOptional()
    @IsNumber()
    quantidadeSugeridaOverride?: number;

    @IsOptional()
    @IsInt()
    ordem?: number;
}
