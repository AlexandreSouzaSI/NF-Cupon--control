import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

// Um item selecionado da NF de entrada original pra devolver — nItemOrigem
// identifica a linha na NF original (ver NfeViewItem.numero), o resto vem
// pré-preenchido a partir dela mas pode ser ajustado (ex: quantidade
// parcial) antes de confirmar.
export class CreateDevolucaoItemDto {
    @IsInt()
    nItemOrigem!: number;

    @IsString()
    descricao!: string;

    @IsOptional()
    @IsString()
    ncm?: string;

    // CFOP original da compra (pra registro/histórico) — o CFOP de
    // devolução é calculado no backend (tabela + fallback manual).
    @IsString()
    cfopOrigem!: string;

    // Só obrigatório se o CFOP original não tiver mapeamento automático
    // conhecido (ver cfop-devolucao.ts) — o backend valida e recusa sem
    // isso quando for o caso.
    @IsOptional()
    @IsString()
    cfopDevolucaoManual?: string;

    @IsNumber()
    @IsPositive()
    quantidade!: number;

    @IsString()
    unidade!: string;

    @IsNumber()
    @Min(0)
    valorUnitario!: number;
}
