import { BadRequestException, Injectable } from '@nestjs/common';
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
}
