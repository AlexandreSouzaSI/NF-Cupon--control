import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
    constructor(private prisma: PrismaService) { }

    async create(data: {
        title: string;
        message: string;
        type: NotificationType;
        userId?: string | null;
    }) {
        return this.prisma.notification.create({
            data,
        });
    }

    async findAll() {
        return this.prisma.notification.findMany({
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async findUnread() {
        return this.prisma.notification.findMany({
            where: {
                read: false,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async markAsRead(id: string) {
        return this.prisma.notification.update({
            where: { id },
            data: {
                read: true,
            },
        });
    }
}