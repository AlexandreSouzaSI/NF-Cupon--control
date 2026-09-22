import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsIn,
    IsOptional,
    IsString,
} from 'class-validator';

import { PixKeyType } from '@prisma/client';

// Corpo de POST purchases/incoming-goods-nf/:id/link — vincula a NF a uma
// compra já cadastrada (Conciliar NF). generateBill é opcional e por
// padrão false, pra manter compatível com os outros 2 lugares que chamam
// esse mesmo endpoint só pra vincular (fiscal-documents/page.tsx e
// EntradaNfTab.tsx), sem gerar conta a pagar nenhuma.
//
// Quando generateBill = true: o service tenta achar o vencimento sozinho
// no grupo "cobr/dup" do XML da própria NF (duplicata) — se achar, cria a
// conta a pagar sem precisar de mais nada daqui (default Boleto pendente,
// código a informar depois). Se não achar, dueDate e paymentType passam a
// ser obrigatórios (validado no service, não aqui, porque depende do
// resultado da extração do XML).
export class LinkIncomingGoodsNfDto {
    @IsString()
    purchaseId!: string;

    @IsOptional()
    @IsBoolean()
    generateBill?: boolean;

    @IsOptional()
    @IsDateString()
    dueDate?: string;

    // Escolha explícita de Boleto/PIX/Nenhum — só é exigida quando o
    // vencimento não foi achado automaticamente no XML (ver comentário
    // acima). Tem prioridade sobre inferência por conteúdo em
    // derivePaymentDefaults.
    @IsOptional()
    @IsIn(['PIX', 'BOLETO', 'NONE'])
    paymentType?: 'PIX' | 'BOLETO' | 'NONE';

    @IsOptional()
    @IsString()
    pixKey?: string;

    @IsOptional()
    @IsEnum(PixKeyType)
    pixKeyType?: PixKeyType;
}
