import { IsNotEmpty, IsString } from 'class-validator';

export class FindOrCreateBillCategoryDto {
    @IsString()
    @IsNotEmpty()
    name!: string;
}
