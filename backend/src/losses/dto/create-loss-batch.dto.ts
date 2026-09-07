import { IsOptional, IsString } from 'class-validator';

// Registro de várias perdas de uma vez, compartilhando UMA foto (ex: tirou
// uma foto de tudo que quebrou junto e lista os itens um por um). Chega
// como multipart/form-data (por causa da foto), então o array de itens
// vem como string JSON no campo "items" — parseado e validado
// manualmente no LossesService (class-validator não valida array
// aninhado vindo de multipart automaticamente).
export class CreateLossBatchDto {
    @IsString()
    storeId!: string;

    // JSON.stringify de: { description, quantity, unit?, reason?, unitValue?, ncm? }[]
    @IsString()
    items!: string;

    // ISO datetime — se não vier, usa o momento do registro, igual ao
    // fluxo de item único.
    @IsOptional()
    @IsString()
    occurredAt?: string;
}
