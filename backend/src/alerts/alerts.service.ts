import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AlertsService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.purchaseAlert.findMany({
            where: {
                resolved: false,
            },
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                purchase: {
                    include: {
                        store: true,
                        supplier: true,
                        createdBy: true,
                    },
                },
            },
        });
    }

    async resolve(id: string) {
        return this.prisma.purchaseAlert.update({
            where: { id },
            data: {
                resolved: true,
            },
        });
    }
}