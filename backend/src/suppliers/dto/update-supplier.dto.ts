import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateSupplierDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    cnpj?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsBoolean()
    active?: boolean;

    // Lista completa das categorias desse fornecedor (substitui, não
    // soma) — ver SupplierCategory/SupplierCategoryLink. Usado pela
    // Cotação pra saber pra quem mandar cada lista.
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    categoryIds?: string[];

    // Lojas que esse fornecedor atende (ver SupplierStore) — lista
    // completa, substitui a anterior. Vazio/omitido = atende todas as
    // lojas (comportamento padrão, sem restrição).
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    storeIds?: string[];
}
