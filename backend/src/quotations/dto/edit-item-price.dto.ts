import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

// Edição manual do preço de um item×fornecedor pelo comprador (ex:
// desconto negociado numa ligação) — vira QuotationSupplierPrice.
// editedUnitPrice, sem mexer no unitPrice original mandado pelo
// fornecedor.
export class EditItemPriceDto {
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    unitPrice!: number;
}
