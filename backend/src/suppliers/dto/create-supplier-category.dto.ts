import { IsString } from 'class-validator';

export class CreateSupplierCategoryDto {
    @IsString()
    name!: string;
}
