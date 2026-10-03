import {
    IsArray,
    IsBoolean,
    IsEmail,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MinLength,
} from 'class-validator';

import { StoreModule, UserRole } from '@prisma/client';

export class CreateUserDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    // E-mail continua obrigatório — vira só canal de recuperação de senha
    // (junto com o WhatsApp), login não é mais por e-mail e senha.
    @IsEmail()
    email!: string;

    // Opcional agora: se vier em branco, o cadastro entra no fluxo de
    // convite — a pessoa recebe um link único por WhatsApp (por isso
    // `phone` passa a ser obrigatório nesse caso, ver validação no
    // service) pra criar a própria senha e ativar a conta. Se vier
    // preenchida, a conta já nasce ativa com essa senha (útil pra reset
    // rápido feito pelo admin, sem depender do WhatsApp).
    @IsOptional()
    @IsString()
    @MinLength(6)
    password?: string;

    @IsEnum(UserRole)
    role!: UserRole;

    // Usado pra mandar aviso no WhatsApp e, a partir de agora, é como a
    // pessoa faz login (telefone + senha) — por isso passa a ser
    // obrigatório quando `password` não é informado (ver service). Aceita
    // qualquer formato digitado — é normalizado no service antes de
    // gravar.
    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    storeIds?: string[];

    // Multi-tenant: só tem efeito quando quem está criando é Admin Master
    // (painel /admin) — pra qualquer outro usuário criando colaborador
    // normal, o service ignora esse campo e usa a própria empresa de quem
    // está criando. Ver users.service.ts#create.
    @IsOptional()
    @IsString()
    empresaId?: string;

    // Permissão extra pra aprovar/reprovar compras — só quem já aprova por
    // conta própria (Admin Master ou Proprietário) pode enviar esse campo,
    // ver ensureCanGrantApprovalPermission em users.service.ts.
    @IsOptional()
    @IsBoolean()
    canApprovePurchases?: boolean;

    // Recebe WhatsApp quando um fornecedor confirma um pedido de cotação
    // (Cadastros → Colaboradores). Exige `phone` preenchido pra funcionar
    // de verdade, mas pode ser marcado antes.
    @IsOptional()
    @IsBoolean()
    notifyQuotationConfirmed?: boolean;

    // Lista de módulos liberados pra essa pessoa especificamente — só o
    // Proprietário (ou Admin Master) pode enviar esse campo, ver
    // ensureCanGrantModuleAccess em users.service.ts. Vazio/omitido = sem
    // restrição extra (usa só perfil + loja, como hoje).
    @IsOptional()
    @IsArray()
    @IsEnum(StoreModule, { each: true })
    moduleAccess?: StoreModule[];

    // Permissão de ver valor de conta categoria Funcionários/Freelancer
    // em Contas a Pagar — mesma restrição de quem pode enviar esse campo.
    @IsOptional()
    @IsBoolean()
    canViewPayrollBills?: boolean;
}