import { IsString } from 'class-validator';

// Upload da planilha (.xlsx) de vendas por produto — chega como
// multipart/form-data (o arquivo vem separado, via @UploadedFile), então
// só o storeId precisa vir validado aqui.
export class ImportProductSalesDto {
    @IsString()
    storeId!: string;
}
