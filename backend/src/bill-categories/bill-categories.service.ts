import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Mesmo tratamento usado pra nome de fornecedor: tira acento, espaço
// duplicado e caixa alta, pra "Materia Prima" e "matéria-prima" caírem na
// mesma categoria.
export function normalizeCategoryName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

// Grupos da tela de Contas a Pagar e as subcategorias que já vêm prontas.
export const BILL_CATEGORY_GROUPS = [
    'FUNCIONARIOS',
    'REVENDA',
    'MATERIA_PRIMA',
    'ATIVO',
    'DESPESAS_FIXAS',
    'SERVICOS',
    'IMPOSTOS',
    'SOCIOS',
] as const;
export type BillCategoryGroup = (typeof BILL_CATEGORY_GROUPS)[number];

export const DEFAULT_BILL_CATEGORIES: { group: BillCategoryGroup; names: string[] }[] = [
    { group: 'FUNCIONARIOS', names: ['Freelancer', 'Músicos', 'Salários', 'Vale-transporte e benefícios'] },
    { group: 'REVENDA', names: ['Destilados', 'Cervejas', 'Refrigerantes e Água', 'Vinhos'] },
    { group: 'MATERIA_PRIMA', names: ['Proteínas', 'Estoque seco', 'Hortifruti', 'Laticínios', 'Gelo'] },
    { group: 'ATIVO', names: ['Copos', 'Pratos', 'Garfos', 'Utensílios de cozinha e bar', 'Equipamentos'] },
    { group: 'DESPESAS_FIXAS', names: ['Aluguel', 'Água', 'Luz', 'Gás', 'Telefone', 'Internet', 'Condomínio'] },
    { group: 'SERVICOS', names: ['Contabilidade', 'Manutenção', 'Limpeza e dedetização', 'Sistemas e assinaturas', 'Marketing', 'Segurança', 'Material de limpeza e descartáveis'] },
    { group: 'IMPOSTOS', names: ['Simples Nacional (DAS)', 'Impostos e guias', 'IPTU', 'Taxas e alvarás', 'Tarifas bancárias', 'Taxas de cartão'] },
    { group: 'SOCIOS', names: ['Retirada / pró-labore', 'Empréstimos'] },
];

// Categorias antigas (texto livre) que caem direto num grupo.
const OLD_NAME_GROUP: Record<string, BillCategoryGroup> = {
    'materia prima': 'MATERIA_PRIMA',
    'materia-prima': 'MATERIA_PRIMA',
    'materias primas': 'MATERIA_PRIMA',
    funcionarios: 'FUNCIONARIOS',
    funcionario: 'FUNCIONARIOS',
    freelancers: 'FUNCIONARIOS',
    revenda: 'REVENDA',
    bebidas: 'REVENDA',
    ativo: 'ATIVO',
    ativos: 'ATIVO',
    sistema: 'SERVICOS',
    sistemas: 'SERVICOS',
    servicos: 'SERVICOS',
    servico: 'SERVICOS',
    impostos: 'IMPOSTOS',
    imposto: 'IMPOSTOS',
    tributos: 'IMPOSTOS',
    socios: 'SOCIOS',
    socio: 'SOCIOS',
    'despesas fixas': 'DESPESAS_FIXAS',
};

export function parseBillCategoryGroup(group: unknown): BillCategoryGroup | null {
    if (group === null || group === undefined || group === '') return null;
    const g = String(group).toUpperCase();
    if (!(BILL_CATEGORY_GROUPS as readonly string[]).includes(g)) {
        throw new BadRequestException('Grupo de categoria inválido.');
    }
    return g as BillCategoryGroup;
}

@Injectable()
export class BillCategoriesService {
    constructor(private prisma: PrismaService) { }

    // Multi-tenant: mesmo padrão do SuppliersService — Admin Master vê a
    // empresa da loja ativa (activeStoreEmpresaId, resolvido no
    // jwt.strategy.ts); sem loja ativa (painel /admin), vê tudo. Qualquer
    // outro usuário só vê/cria categoria da própria empresa, sempre.
    private empresaFilter(actingUser?: any) {
        if (!actingUser) return undefined;
        if (actingUser.isAdminMaster) return actingUser.activeStoreEmpresaId;
        return actingUser.empresaId;
    }

    // BillCategory.empresaId agora é obrigatório no banco — mesmo motivo do
    // requireEmpresaId em suppliers.service.ts: erro claro em vez de
    // estourar a constraint NOT NULL do Prisma.
    private requireEmpresaId(actingUser?: any): string {
        const empresaId = actingUser?.isAdminMaster
            ? actingUser?.activeStoreEmpresaId
            : actingUser?.empresaId;

        if (!empresaId) {
            throw new BadRequestException(
                'Não foi possível identificar sua empresa pra cadastrar isso. Selecione uma loja no topo do sistema.',
            );
        }

        return empresaId;
    }

    // Digitou o nome, usa a categoria que já existe (reativando se estava
    // desativada) ou cadastra uma nova na hora — mesmo padrão do fornecedor.
    async findOrCreate(name: string, actingUser?: any, group?: string | null) {
        const trimmed = (name || '').trim();

        if (!trimmed) {
            throw new BadRequestException('Informe o nome da categoria.');
        }

        const nameNormalized = normalizeCategoryName(trimmed);
        const empresaId = this.requireEmpresaId(actingUser);
        const parsedGroup = parseBillCategoryGroup(group);

        const existing = await this.prisma.billCategory.findFirst({
            where: { nameNormalized, empresaId },
        });

        if (existing) {
            // Só preenche o grupo se ela ainda não tinha um — não muda o
            // grupo de uma categoria que já foi organizada.
            const fillGroup = parsedGroup && !existing.group;
            if (!existing.active || fillGroup) {
                return this.prisma.billCategory.update({
                    where: { id: existing.id },
                    data: {
                        active: true,
                        ...(fillGroup ? { group: parsedGroup } : {}),
                    },
                });
            }

            return existing;
        }

        return this.prisma.billCategory.create({
            data: {
                name: trimmed,
                nameNormalized,
                empresaId,
                group: parsedGroup,
            },
        });
    }

    // Cria (uma vez só, idempotente) as subcategorias padrão de cada grupo
    // pra empresa da loja ativa. Categoria com o mesmo nome que já existia
    // é reaproveitada e ganha o grupo se ainda não tinha.
    async ensureDefaults(actingUser?: any) {
        const empresaId = this.requireEmpresaId(actingUser);
        const existentes = await this.prisma.billCategory.findMany({
            where: { empresaId },
            select: { id: true, nameNormalized: true, group: true, active: true },
        });
        const porNome = new Map(existentes.map((c) => [c.nameNormalized, c]));

        // Categorias antigas com nome de grupo ("Matéria Prima", "Sistema"...)
        // entram no grupo certo.
        for (const c of existentes) {
            const g = OLD_NAME_GROUP[c.nameNormalized];
            if (g && !c.group) {
                await this.prisma.billCategory.update({ where: { id: c.id }, data: { group: g } });
            }
        }

        const novas: { name: string; nameNormalized: string; empresaId: string; group: string }[] = [];
        for (const { group, names } of DEFAULT_BILL_CATEGORIES) {
            for (const name of names) {
                const nameNormalized = normalizeCategoryName(name);
                const atual = porNome.get(nameNormalized);
                if (!atual) {
                    novas.push({ name, nameNormalized, empresaId, group });
                } else if (!atual.group || !atual.active) {
                    await this.prisma.billCategory.update({
                        where: { id: atual.id },
                        data: { active: true, ...(atual.group ? {} : { group }) },
                    });
                }
            }
        }
        if (novas.length) {
            await this.prisma.billCategory.createMany({ data: novas, skipDuplicates: true });
        }

        return this.findAll(undefined, actingUser);
    }

    // Renomear / trocar o grupo de uma categoria da própria empresa.
    async update(id: string, data: { name?: string; group?: string | null }, actingUser?: any) {
        const empresaId = this.requireEmpresaId(actingUser);
        const category = await this.prisma.billCategory.findFirst({ where: { id, empresaId } });
        if (!category) throw new NotFoundException('Categoria não encontrada.');

        const patch: { name?: string; nameNormalized?: string; group?: string | null } = {};
        if (data.name !== undefined) {
            const trimmed = data.name.trim();
            if (!trimmed) throw new BadRequestException('Informe o nome da categoria.');
            const nameNormalized = normalizeCategoryName(trimmed);
            const clash = await this.prisma.billCategory.findFirst({
                where: { nameNormalized, empresaId, id: { not: id } },
            });
            if (clash) throw new ConflictException('Já existe uma categoria com esse nome.');
            patch.name = trimmed;
            patch.nameNormalized = nameNormalized;
        }
        if (data.group !== undefined) patch.group = parseBillCategoryGroup(data.group);

        return this.prisma.billCategory.update({ where: { id }, data: patch });
    }

    async findAll(search: string | undefined, actingUser?: any) {
        const trimmedSearch = search?.trim();
        const empresaId = this.empresaFilter(actingUser);

        return this.prisma.billCategory.findMany({
            where: {
                active: true,
                ...(empresaId !== undefined ? { empresaId } : {}),
                nameNormalized: trimmedSearch
                    ? { contains: normalizeCategoryName(trimmedSearch) }
                    : undefined,
            },
            orderBy: { name: 'asc' },
            take: trimmedSearch ? 10 : undefined,
        });
    }

    // Sugestão pra pré-preencher o campo Categoria na hora de aceitar uma
    // NF: pega a categoria da última conta a pagar lançada pra esse mesmo
    // fornecedor. Não é obrigatório o usuário usar — só agiliza.
    async suggestForSupplier(supplierId: string) {
        if (!supplierId) return null;

        const lastBill = await this.prisma.bill.findFirst({
            where: { supplierId, categoryId: { not: null } },
            orderBy: { createdAt: 'desc' },
            select: {
                category: true,
            },
        });

        return lastBill?.category || null;
    }

    // Exclusão de verdade — restrita ao dono do sistema (AdminMasterGuard
    // no controller). Antes disso essa categoria não tinha delete nenhum,
    // só desativação implícita indireta (nunca era usada na prática).
    async removeDefinitivo(id: string) {
        const category = await this.prisma.billCategory.findUnique({
            where: { id },
        });

        if (!category) {
            throw new NotFoundException('Categoria não encontrada.');
        }

        try {
            await this.prisma.billCategory.delete({ where: { id } });
        } catch (error: any) {
            if (error?.code === 'P2003') {
                throw new ConflictException(
                    'Essa categoria já tem contas a pagar vinculadas — não dá pra excluir de vez.',
                );
            }
            throw error;
        }

        return { ok: true };
    }
}
