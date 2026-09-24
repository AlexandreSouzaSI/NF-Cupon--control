import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsNumber,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

export class QuotationPriceEntryDto {
    @IsString() quotationItemId!: string;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    unitPrice!: number;
}

// Preenchido pelo fornecedor na página pública (sem login) — token no
// path já identifica o QuotationSupplier, não precisa mandar id de novo.
export class SubmitQuotationPricesDto {
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => QuotationPriceEntryDto)
    prices!: QuotationPriceEntryDto[];
}
