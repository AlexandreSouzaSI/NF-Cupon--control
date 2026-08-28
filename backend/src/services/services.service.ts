import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { NotificationType, UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import {
    decodeArquivoXml,
    fetchDistribution,
    loadCertificate,
} from '../stores/sefaz-nfse-client';

// Mesma pasta usada pelo upload manual de NF de serviço — os XMLs baixados
// da Sefaz ficam lado a lado com os enviados à mão.
const incomingNfPath = join(process.cwd(), 'uploads', 'services');

if (!existsSync(incomingNfPath)) {
    mkdirSync(incomingNfPath, { recursive: true });
}

// Limite de idas e vindas por chamada de sincronização — evita que uma
// loja com histórico enorme prenda a requisição por muito tempo; o que
// sobrar continua no próximo clique, já que o NSU fica salvo.
const MAX_SYNC_BATCHES = 25;

// Quem recebe o aviso de novo serviço registrado — Administrativo e
// Proprietário sempre entram automaticamente (acesso global, ver
// notifyStoreAccess), então só precisa listar Gerente aqui.
const SERVICE_NOTIFY_ROLES: UserRole[] = [UserRole.GERENTE];

@Injectable()
export class ServicesService {
    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService,
    ) { }

    private getAllowedStoreIds(user: any): string[] | undefined {
        if (
            user.role === UserRole.ADMINISTRATIVO ||
            user.role === UserRole.PROPRIETARIO
        ) {
            return undefined;
        }

        return (
            user.userStores?.map(
                (item: any) => item.storeId || item.store?.id,
            ) || []
        );
    }

    private ensureStoreAccess(storeId: string, user: any) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (!allowedStoreIds) {
            return;
        }

        if (!allowedStoreIds.includes(storeId)) {
            throw new ForbiddenException(
                'Você não tem acesso a esta loja.',
            );
        }
    }

    private async ensureServiceAccess(id: string, user: any) {
        const service = await this.prisma.service.findUnique({
            where: { id },
        });

        if (!service) {
            throw new NotFoundException(
                'Serviço não encontrado.',
            );
        }

        this.ensureStoreAccess(service.storeId, user);

        return service;
    }

    // Datas vindas de <input type="date"> chegam sem horário; gravamos com
    // horário intermediário pra não recuar um dia por causa do fuso.
    private toDateWithNoonUtc(value: string) {
        if (value.length <= 10) {
            return new Date(`${value}T12:00:00.000Z`);
        }

        return new Date(value);
    }

    private defaultInclude() {
        return {
            store: true,
            createdBy: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
        };
    }

    async create(dto: CreateServiceDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        const service = await this.prisma.service.create({
            data: {
                name: dto.name,
                providerName: dto.providerName,
                description: dto.description,
                value: dto.value,
                serviceDate: this.toDateWithNoonUtc(
                    dto.serviceDate,
                ),
                storeId: dto.storeId,
                notes: dto.notes,
                paymentMethod: dto.paymentMethod,
                pixKey: dto.pixKey,
                pixKeyType: dto.pixKeyType,
                createdById: user.id,
            },
            include: this.defaultInclude(),
        });

        await this.notificationsService.notifyStoreAccess({
            storeId: service.storeId,
            allowedRoles: SERVICE_NOTIFY_ROLES,
            excludeUserId: user.id,
            title: 'Novo serviço registrado',
            message: `${service.createdBy.name} registrou o serviço "${service.name}" (${service.providerName}) em ${service.store.name}.`,
            type: NotificationType.SERVICE_ADDED,
        });

        return service;
    }

    async findAll(
        user: any,
        filters?: {
            storeId?: string;
            name?: string;
            month?: string; // YYYY-MM
            startDate?: string;
            endDate?: string;
            onlyWithNf?: boolean;
        },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        let dateFilter: { gte?: Date; lte?: Date } | undefined;

        if (filters?.month) {
            const [year, month] = filters.month
                .split('-')
                .map(Number);

            const start = new Date(
                Date.UTC(year, month - 1, 1, 0, 0, 0, 0),
            );

            const end = new Date(
                Date.UTC(year, month, 0, 23, 59, 59, 999),
            );

            dateFilter = { gte: start, lte: end };
        } else if (filters?.startDate || filters?.endDate) {
            dateFilter = {
                gte: filters.startDate
                    ? this.toDateWithNoonUtc(filters.startDate)
                    : undefined,
                lte: filters.endDate
                    ? new Date(
                        `${filters.endDate}T23:59:59.999Z`,
                    )
                    : undefined,
            };
        }

        return this.prisma.service.findMany({
            where: {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds
                        ? { in: allowedStoreIds }
                        : undefined),
                name: filters?.name
                    ? {
                        contains: filters.name,
                        mode: 'insensitive',
                    }
                    : undefined,
                serviceDate: dateFilter,
                nfFileUrl: filters?.onlyWithNf
                    ? { not: null }
                    : undefined,
            },
            orderBy: {
                serviceDate: 'desc',
            },
            include: this.defaultInclude(),
        });
    }

    async findOne(id: string, user: any) {
        await this.ensureServiceAccess(id, user);

        return this.prisma.service.findUnique({
            where: { id },
            include: this.defaultInclude(),
        });
    }

    async update(id: string, dto: UpdateServiceDto, user: any) {
        await this.ensureServiceAccess(id, user);

        if (dto.storeId) {
            this.ensureStoreAccess(dto.storeId, user);
        }

        return this.prisma.service.update({
            where: { id },
            data: {
                name: dto.name,
                providerName: dto.providerName,
                description: dto.description,
                value: dto.value,
                serviceDate: dto.serviceDate
                    ? this.toDateWithNoonUtc(dto.serviceDate)
                    : undefined,
                storeId: dto.storeId,
                notes: dto.notes,
                paymentMethod: dto.paymentMethod,
                pixKey: dto.pixKey,
                pixKeyType: dto.pixKeyType,
            },
            include: this.defaultInclude(),
        });
    }

    async attachNf(
        id: string,
        user: any,
        file: { fileUrl: string; originalName: string },
    ) {
        await this.ensureServiceAccess(id, user);

        return this.prisma.service.update({
            where: { id },
            data: {
                nfFileUrl: file.fileUrl,
                nfOriginalName: file.originalName,
            },
            include: this.defaultInclude(),
        });
    }

    async remove(id: string, user: any) {
        if (
            ![
                UserRole.ADMINISTRATIVO,
                UserRole.PROPRIETARIO,
                UserRole.GERENTE,
            ].includes(user.role)
        ) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para excluir serviços.',
            );
        }

        await this.ensureServiceAccess(id, user);

        return this.prisma.service.delete({
            where: { id },
        });
    }

    async findForDownload(
        user: any,
        filters: {
            storeId?: string;
            month?: string;
            startDate?: string;
            endDate?: string;
        },
    ) {
        const services = await this.findAll(user, {
            ...filters,
            onlyWithNf: true,
        });

        if (services.length === 0) {
            throw new BadRequestException(
                'Nenhuma NF de serviço encontrada nesse período.',
            );
        }

        return services;
    }

    // Busca novos documentos na distribuição da Sefaz a partir do último
    // NSU processado dessa loja, salva o XML de cada NFS-e encontrada e
    // deixa pronta pra conciliação manual (não tenta adivinhar sozinho a
    // qual Serviço cadastrado cada NF pertence).
    async syncFromSefaz(storeId: string, user: any) {
        if (!storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(storeId, user);

        const certificate = await this.prisma.storeCertificate.findUnique({
            where: { storeId },
        });

        if (!certificate) {
            throw new BadRequestException(
                'Essa loja não tem certificado digital cadastrado. Cadastre em Cadastros → Lojas antes de buscar as NFs.',
            );
        }

        const cert = loadCertificate(certificate.filePath, {
            cipher: certificate.passwordCipher,
            iv: certificate.passwordIv,
            authTag: certificate.passwordAuthTag,
        });

        let cursor = certificate.lastNsu;
        let fetchedTotal = 0;
        let nfseCount = 0;

        for (let batch = 0; batch < MAX_SYNC_BATCHES; batch++) {
            const response = await fetchDistribution(cert, cursor);

            if (response.StatusProcessamento === 'NENHUM_DOCUMENTO_LOCALIZADO') {
                break;
            }

            const lote = response.LoteDFe || [];

            if (lote.length === 0) {
                break;
            }

            let maxNsuInBatch = cursor;

            for (const item of lote) {
                const itemNsu = BigInt(item.NSU);

                if (itemNsu > maxNsuInBatch) {
                    maxNsuInBatch = itemNsu;
                }

                if (!item.ChaveAcesso) {
                    continue;
                }

                let fileUrl: string | undefined;

                if (item.ArquivoXml) {
                    const xml = decodeArquivoXml(item.ArquivoXml);
                    const fileName = `sefaz-${item.ChaveAcesso}.xml`;

                    writeFileSync(
                        join(incomingNfPath, fileName),
                        xml,
                        'utf-8',
                    );

                    fileUrl = `/uploads/services/${fileName}`;
                }

                await this.prisma.incomingServiceNf.upsert({
                    where: {
                        storeId_chaveAcesso: {
                            storeId,
                            chaveAcesso: item.ChaveAcesso,
                        },
                    },
                    update: {
                        nsu: itemNsu,
                        tipoDocumento: item.TipoDocumento,
                        tipoEvento: item.TipoEvento || undefined,
                        fileUrl,
                        generatedAt: item.DataHoraGeracao
                            ? new Date(item.DataHoraGeracao)
                            : undefined,
                    },
                    create: {
                        storeId,
                        chaveAcesso: item.ChaveAcesso,
                        nsu: itemNsu,
                        tipoDocumento: item.TipoDocumento,
                        tipoEvento: item.TipoEvento || undefined,
                        fileUrl,
                        generatedAt: item.DataHoraGeracao
                            ? new Date(item.DataHoraGeracao)
                            : undefined,
                    },
                });

                fetchedTotal += 1;

                if (item.TipoDocumento === 'NFSE') {
                    nfseCount += 1;
                }
            }

            cursor = maxNsuInBatch + 1n;
        }

        await this.prisma.storeCertificate.update({
            where: { storeId },
            data: { lastNsu: cursor },
        });

        return {
            fetchedTotal,
            nfseCount,
        };
    }

    async findIncomingNf(user: any, filters?: { storeId?: string }) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        const items = await this.prisma.incomingServiceNf.findMany({
            where: {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                tipoDocumento: 'NFSE',
                serviceId: null,
            },
            orderBy: {
                generatedAt: 'desc',
            },
        });

        // BigInt não serializa em JSON por padrão — convertemos antes de
        // devolver pro front.
        return items.map((item) => ({
            ...item,
            nsu: item.nsu.toString(),
        }));
    }

    async reconcileIncomingNf(
        incomingNfId: string,
        serviceId: string,
        user: any,
    ) {
        const incoming = await this.prisma.incomingServiceNf.findUnique({
            where: { id: incomingNfId },
        });

        if (!incoming) {
            throw new NotFoundException('Documento não encontrado.');
        }

        this.ensureStoreAccess(incoming.storeId, user);

        if (!incoming.fileUrl) {
            throw new BadRequestException(
                'Esse documento não tem XML disponível pra anexar.',
            );
        }

        const service = await this.ensureServiceAccess(serviceId, user);

        if (service.storeId !== incoming.storeId) {
            throw new BadRequestException(
                'O serviço selecionado é de outra loja.',
            );
        }

        await this.prisma.incomingServiceNf.update({
            where: { id: incomingNfId },
            data: { serviceId },
        });

        return this.prisma.service.update({
            where: { id: serviceId },
            data: {
                nfFileUrl: incoming.fileUrl,
                nfOriginalName: `sefaz-${incoming.chaveAcesso}.xml`,
            },
            include: this.defaultInclude(),
        });
    }
}
