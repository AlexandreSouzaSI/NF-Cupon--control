import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';

// Remove acento, espaços duplicados e caixa alta pra comparar nomes de
// fornecedor de forma tolerante (ex.: "Distribuidora Souza" === "distribuidora   souza").
export function normalizeSupplierName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
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

        return this.prisma.supplier.findMany({
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
        });
    }
}
