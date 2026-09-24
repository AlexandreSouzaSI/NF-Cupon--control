import { IsArray, IsOptional, IsString } from 'class-validator';

// supplierIds opcional: se não vier, o sistema seleciona sozinho todos os
// fornecedores ativos vinculados a essa categoria (SupplierCategoryLink)
// que atendem essa loja (SupplierStore vazio = atende todas).
export class SendQuotationDto {
    @IsString() storeId!: string;
    @IsString() categoryId!: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    supplierIds?: string[];
}
