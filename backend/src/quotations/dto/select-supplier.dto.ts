import { IsString } from 'class-validator';

export class SelectSupplierDto {
    @IsString() supplierId!: string;
}
