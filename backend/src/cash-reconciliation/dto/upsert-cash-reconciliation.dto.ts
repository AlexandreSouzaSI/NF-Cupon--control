import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

// Lançamento manual dos dois lados do dia — não existe integração com
// PDV/frente de caixa hoje, então "o que entrou no sistema" também é
// digitado por quem faz a conferência. Ver CashReconciliation no
// schema.prisma pro porquê da quebra por forma de pagamento nos dois
// lados (aponta onde exatamente está a diferença, não só o total).
export class UpsertCashReconciliationDto {
    @IsString()
    storeId!: string;

    // "AAAA-MM-DD" vindo de <input type="date"> — convertido no service
    // com horário intermediário (meio-dia UTC), mesmo padrão do resto do
    // projeto.
    @IsString()
    date!: string;

    @IsNumber()
    @Min(0)
    systemCash!: number;

    @IsNumber()
    @Min(0)
    systemDebit!: number;

    @IsNumber()
    @Min(0)
    systemCredit!: number;

    @IsNumber()
    @Min(0)
    bankCash!: number;

    @IsNumber()
    @Min(0)
    bankDebit!: number;

    @IsNumber()
    @Min(0)
    bankCredit!: number;

    @IsOptional()
    @IsString()
    notes?: string;
}
