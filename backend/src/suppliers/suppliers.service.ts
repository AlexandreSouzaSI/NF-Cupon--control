import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';

@Injectable()
export class SuppliersService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateSupplierDto) {
        return this.prisma.supplier.create({
            data: dto,
        });
    }

    async findAll() {
        return this.prisma.supplier.findMany({
            where: {
                active: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
    }
}