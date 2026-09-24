import { PartialType } from '@nestjs/mapped-types';
import { CreateProductionItemDto } from './create-production-item.dto';

// storeId não faz sentido trocar num update — mas herdar via
// PartialType é inofensivo (o service ignora o campo no update).
export class UpdateProductionItemDto extends PartialType(
    CreateProductionItemDto,
) {}
