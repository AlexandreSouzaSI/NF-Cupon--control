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

@Injectable()
export class BillCategoriesService {
    constructor(private prisma: PrismaService) { }

    // Digitou o nome, usa a categoria que já existe (reativando se estava
    // desativada) ou cadastra uma nova na hora — mesmo padrão do fornecedor.
    async findOrCreate(name: string) {
        const trimmed = (name || '').trim();

        if (!trimmed) {
            throw new BadRequestException('Informe o nome da categoria.');
        }

        const nameNormalized = normalizeCategoryName(trimmed);

        const existing = await this.prisma.billCategory.findUnique({
            where: { nameNormalized },
        });

        if (existing) {
            if (!existing.active) {
                return this.prisma.billCategory.update({
                    where: { id: existing.id },
                    data: { active: true },
                });
            }

            return existing;
        }

        return this.prisma.billCategory.create({
            data: {
                name: trimmed,
                nameNormalized,
            },
        });
    }

    async findAll(search?: string) {
        const trimmedSearch = search?.trim();

        return this.prisma.billCategory.findMany({
            where: {
                active: true,
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
