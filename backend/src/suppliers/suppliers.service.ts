import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto';
import { normalizePhone } from '../common/phone.util';

// Remove acento, espaços duplicados e caixa alta pra comparar nomes de
// fornecedor de forma tolerante (ex.: "Distribuidora Souza" === "distribuidora   souza").
export function normalizeSupplierName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

const supplierWithCategories = {
    categories: { include: { category: true } },
    stores: { include: { store: true } },
};

// Achata o include acima pro frontend não precisar navegar
// categories[i].category.name / stores[i].store.name toda hora. Lista
// "stores" vazia significa "atende todas as lojas" — o frontend decide o
// texto exibido a partir disso.
function flattenSupplier(supplier: any) {
    if (!supplier) return supplier;

    const { categories, stores, ...rest } = supplier;

    return {
        ...rest,
        categories: (categories || []).map((link: any) => link.category),
        stores: (stores || []).map((link: any) => link.store),
    };
}

@Injectable()
export class SuppliersService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateSupplierDto) {
        const name = dto.name.trim();
        const nameNormalized = normalizeSupplierName(name);

        const existing = await this.prisma.supplier.findUnique({
            where: { nameNormalized },
        });

        if (existing) {
            throw new ConflictException(
                'Já existe um fornecedor cadastrado com esse nome.',
            );
        }

        return this.prisma.supplier.create({
            data: {
                ...dto,
                name,
                nameNormalized,
                phone: dto.phone ? normalizePhone(dto.phone) : undefined,
            },
        });
    }

    // Usado na hora de criar a compra: digitou o nome, usa o fornecedor que
    // já existe (reativando se estava desativado) ou cadastra um novo na hora.
    async findOrCreate(name: string) {
        const trimmed = (name || '').trim();

        if (!trimmed) {
            throw new BadRequestException(
                'Informe o nome do fornecedor.',
            );
        }

        const nameNormalized = normalizeSupplierName(trimmed);

        const existing = await this.prisma.supplier.findUnique({
            where: { nameNormalized },
        });

        if (existing) {
            if (!existing.active) {
                return this.prisma.supplier.update({
                    where: { id: existing.id },
                    data: { active: true },
                });
            }

            return existing;
        }

        return this.prisma.supplier.create({
            data: {
                name: trimmed,
                nameNormalized,
            },
        });
    }

    async findAll(search?: string) {
        const trimmedSearch = search?.trim();

        const suppliers = await this.prisma.supplier.findMany({
            where: {
                active: true,
                nameNormalized: trimmedSearch
                    ? { contains: normalizeSupplierName(trimmedSearch) }
                    : undefined,
            },
            orderBy: {
                name: 'asc',
            },
            take: trimmedSearch ? 10 : undefined,
            include: supplierWithCategories,
        });

        return suppliers.map(flattenSupplier);
    }

    // Update completo — usado em Cadastros → Fornecedores, principalmente
    // pra vincular as categorias (Cotação) e o telefone de WhatsApp. Não
    // existia endpoint de edição antes disso.
    async update(id: string, dto: UpdateSupplierDto) {
        const supplier = await this.prisma.supplier.findUnique({
            where: { id },
        });

        if (!supplier) {
            throw new BadRequestException('Fornecedor não encontrado.');
        }

        const data: any = {};

        if (dto.name !== undefined) {
            const name = dto.name.trim();
            const nameNormalized = normalizeSupplierName(name);

            if (nameNormalized !== supplier.nameNormalized) {
                const conflict = await this.prisma.supplier.findUnique({
                    where: { nameNormalized },
                });

                if (conflict && conflict.id !== id) {
                    throw new ConflictException(
                        'Já existe um fornecedor cadastrado com esse nome.',
                    );
                }
            }

            data.name = name;
            data.nameNormalized = nameNormalized;
        }

        if (dto.cnpj !== undefined) data.cnpj = dto.cnpj || null;
        if (dto.phone !== undefined) {
            data.phone = dto.phone ? normalizePhone(dto.phone) : null;
        }
        if (dto.active !== undefined) data.active = dto.active;

        if (dto.categoryIds) {
            // Substitui a lista inteira — apaga os vínculos antigos e cria
            // os novos, mais simples que calcular diff.
            await this.prisma.supplierCategoryLink.deleteMany({
                where: { supplierId: id },
            });

            data.categories = {
                create: dto.categoryIds.map((categoryId) => ({
                    categoryId,
                })),
            };
        }

        if (dto.storeIds !== undefined) {
            // Mesma lógica de substituição total do categoryIds. Lista
            // vazia é um valor válido (e o caso mais comum): significa
            // "voltar a atender todas as lojas".
            await this.prisma.supplierStore.deleteMany({
                where: { supplierId: id },
            });

            data.stores = {
                create: dto.storeIds.map((storeId) => ({
                    storeId,
                })),
            };
        }

        const updated = await this.prisma.supplier.update({
            where: { id },
            data,
            include: supplierWithCategories,
        });

        return flattenSupplier(updated);
    }

    // --- Categorias de fornecedor (Cotação) ---

    async findAllCategories() {
        return this.prisma.supplierCategory.findMany({
            orderBy: { name: 'asc' },
        });
    }

    async createCategory(dto: CreateSupplierCategoryDto) {
        const name = dto.name.trim();
        const nameNormalized = normalizeSupplierName(name);

        const existing = await this.prisma.supplierCategory.findUnique({
            where: { nameNormalized },
        });

        if (existing) {
            throw new ConflictException(
                'Já existe uma categoria com esse nome.',
            );
        }

        return this.prisma.supplierCategory.create({
            data: { name, nameNormalized },
        });
    }

    async renameCategory(id: string, name: string) {
        const trimmed = name.trim();

        if (!trimmed) {
            throw new ConflictException('Informe um nome pra lista.');
        }

        const nameNormalized = normalizeSupplierName(trimmed);

        const existing = await this.prisma.supplierCategory.findUnique({
            where: { nameNormalized },
        });

        if (existing && existing.id !== id) {
            throw new ConflictException(
                'Já existe uma categoria com esse nome.',
            );
        }

        return this.prisma.supplierCategory.update({
            where: { id },
            data: { name: trimmed, nameNormalized },
        });
    }

    async removeCategory(id: string) {
        // Vínculo com fornecedor (SupplierCategoryLink) e agenda
        // (QuotationScheduleEntry) caem em cascata (onDelete: Cascade no
        // schema). Cotação (Quotation.categoryId) NÃO tem cascade de
        // propósito — se já teve alguma cotação nessa categoria, a
        // exclusão é bloqueada pelo banco pra não perder o histórico;
        // avisa isso de forma amigável em vez de deixar estourar o erro
        // cru do Prisma.
        const emUso = await this.prisma.quotation.findFirst({
            where: { categoryId: id },
            select: { id: true },
        });

        if (emUso) {
            throw new ConflictException(
                'Essa categoria já tem cotação no histórico — não dá pra excluir (desative os fornecedores dela em vez disso).',
            );
        }

        await this.prisma.supplierCategory.delete({ where: { id } });

        return { ok: true };
    }

    // Exclusão de verdade do fornecedor — restrita a isAdminMaster no
    // controller (AdminMasterGuard). Diferente do "desativar" (que nem
    // existe hoje pra fornecedor via UI), isso apaga a linha mesmo.
    // Se tiver Purchase/Quotation/NF vinculada, o banco recusa (FK) —
    // traduzimos pra uma mensagem amigável em vez do erro cru do Prisma.
    async remove(id: string) {
        const supplier = await this.prisma.supplier.findUnique({ where: { id } });
        if (!supplier) throw new BadRequestException('Fornecedor não encontrado.');

        try {
            await this.prisma.supplierCategoryLink.deleteMany({ where: { supplierId: id } });
            await this.prisma.supplierStore.deleteMany({ where: { supplierId: id } });
            await this.prisma.supplier.delete({ where: { id } });
        } catch (error: any) {
            if (error?.code === 'P2003') {
                throw new ConflictException(
                    'Esse fornecedor já tem compras, cotações ou notas fiscais vinculadas — não dá pra excluir de vez.',
                );
            }
            throw error;
        }

        return { ok: true };
    }
}
