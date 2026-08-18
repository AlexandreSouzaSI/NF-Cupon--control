import { IsNotEmpty, IsString } from 'class-validator';

export class FindOrCreateSupplierDto {
    @IsString()
    @IsNotEmpty()
    name!: string;
}
