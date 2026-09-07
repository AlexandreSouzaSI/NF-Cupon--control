import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { NotificationType, UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { BillsService } from '../bills/bills.service';
import { BillCategoriesService } from '../bill-categories/bill-categories.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { AcceptIncomingNfDto } from './dto/accept-incoming-nf.dto';
import {
    decodeArquivoXml,
    fetchDistribution,
    loadCertificate,
    parseNfseForView,
    parseNfseXml,
    type NfseView,
} from '../stores/sefaz-nfse-client';
import { sleep } from '../common/sleep.util';
import { derivePaymentDefaults } from '../common/bill-payment-defaults.util';

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

// Mesmo espírito da sincronização de NF-e de mercadoria: espera entre
// consultas dentro do loop, pra não martelar o webservice nacional.
const SERVICE_SYNC_DELAY_MS = 2000;

// Depois de "nada de novo" ou de uma rejeição, evita insistir antes de 1h —
// mesmo raciocínio da distribuição de NF-e (mesmo serviço de distribuição
// nacional por trás, mesmo CNPJ podendo ser consultado por outro sistema).
const SEFAZ_COOLDOWN_MS = 60 * 60 * 1000;

// Quem recebe o aviso de novo serviço registrado — Administrativo e
// Proprietário sempre entram automaticamente (acesso global, ver
// notifyStoreAccess), então só precisa listar Gerente aqui.
const SERVICE_NOTIFY_ROLES: UserRole[] = [UserRole.GERENTE];

// dhEmi/dhProc vêm em ISO 8601 (2026-08-27T10:00:00-03:00); dCompet às
// vezes vem só como data (2026-08-27). new Date() aceita os dois formatos,
// mas devolve "Invalid Date" silenciosamente se o texto vier fora do
// esperado — aqui a gente filtra isso pra não gravar uma data quebrada.
function parseIssueDate(value?: string): Date | undefined {
    if (!value) return undefined;

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? undefined : date;
}

@Injectable()
export class ServicesService {
    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService,
        private suppliersService: SuppliersService,
        private billsService: BillsService,
        private billCategoriesService: BillCategoriesService,
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

        const dateFilter = this.buildDateFilter(filters);

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

    // Extraído de findAll pra reaproveitar o mesmo filtro de data (mês ou
    // intervalo) na busca de download em zip, que combina Service com
    // IncomingServiceNf.
    private buildDateFilter(filters?: {
        month?: string;
        startDate?: string;
        endDate?: string;
    }): { gte?: Date; lte?: Date } | undefined {
        if (filters?.month) {
            const [year, month] = filters.month.split('-').map(Number);

            const start = new Date(
                Date.UTC(year, month - 1, 1, 0, 0, 0, 0),
            );

            const end = new Date(
                Date.UTC(year, month, 0, 23, 59, 59, 999),
            );

            return { gte: start, lte: end };
        }

        if (filters?.startDate || filters?.endDate) {
            return {
                gte: filters.startDate
                    ? this.toDateWithNoonUtc(filters.startDate)
                    : undefined,
                lte: filters.endDate
                    ? new Date(`${filters.endDate}T23:59:59.999Z`)
                    : undefined,
            };
        }

        return undefined;
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

    // Base das duas origens de NF de serviço com arquivo: Service com
    // nfFileUrl (conciliado manualmente ou vinculado a uma NF baixada da
    // Sefaz) e IncomingServiceNf ainda não vinculada a nenhum Service —
    // serviceId: null evita duplicar o arquivo de uma NF que já foi
    // conciliada (aí o Service já cobre o mesmo arquivo). Não filtra por
    // aceita/recusada aqui de propósito — quem chama decide se quer só as
    // aceitas (findConfirmedNf, pra tela) ou todas (findAllNfForDownload,
    // pro zip) — ver findConfirmedNf logo abaixo.
    private async findServiceNfSources(user: any, storeId?: string) {
        const services = await this.findAll(user, {
            storeId,
            onlyWithNf: true,
        });

        const allowedStoreIds = this.getAllowedStoreIds(user);

        const incoming = await this.prisma.incomingServiceNf.findMany({
            where: {
                storeId:
                    storeId || (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                fileUrl: { not: null },
                serviceId: null,
                ignored: false,
            },
            orderBy: { issueDate: 'desc' },
        });

        return { services, incoming };
    }

    private mapServiceSource(service: {
        id: string;
        nfFileUrl: string | null;
        nfOriginalName: string | null;
        serviceDate: Date;
        providerName: string;
        value: any;
    }) {
        return {
            id: service.id,
            source: 'service' as const,
            fileUrl: service.nfFileUrl as string,
            originalName: service.nfOriginalName,
            date: service.serviceDate,
            providerName: service.providerName,
            value: service.value,
        };
    }

    private mapIncomingSource(incoming: {
        id: string;
        fileUrl: string | null;
        issueDate: Date | null;
        fetchedAt: Date;
        issuerName: string | null;
        value: any;
    }) {
        return {
            id: incoming.id,
            source: 'incoming' as const,
            fileUrl: incoming.fileUrl as string,
            originalName: null as string | null,
            date: incoming.issueDate || incoming.fetchedAt,
            providerName: incoming.issuerName || 'Prestador não identificado',
            value: incoming.value,
        };
    }

    // Usado pela tela (lista "NF de serviços" + total) — só entra o que já
    // foi aceito (accepted ou billId), pra não misturar pendente na lista
    // de confirmadas.
    async findConfirmedNf(user: any, storeId?: string) {
        if (storeId) {
            this.ensureStoreAccess(storeId, user);
        }

        const { services, incoming } = await this.findServiceNfSources(
            user,
            storeId,
        );

        const acceptedIncoming = incoming.filter(
            (item) => item.accepted || item.billId,
        );

        return [
            ...services.map((service) => this.mapServiceSource(service)),
            ...acceptedIncoming.map((item) => this.mapIncomingSource(item)),
        ];
    }

    // Usado só pelo zip de download — inclui TODAS as NF de serviço com
    // arquivo (pendente, vinculada a conta, aceita sem gerar conta ou já
    // conciliada num Serviço), não só as aceitas. O usuário pediu acesso a
    // todas as NFs a qualquer momento, vinculadas ou não a algo existente.
    async findAllNfForDownload(user: any, storeId?: string) {
        if (storeId) {
            this.ensureStoreAccess(storeId, user);
        }

        const { services, incoming } = await this.findServiceNfSources(
            user,
            storeId,
        );

        return [
            ...services.map((service) => this.mapServiceSource(service)),
            ...incoming.map((item) => this.mapIncomingSource(item)),
        ];
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
        const allItems = await this.findAllNfForDownload(user, filters?.storeId);
        const dateFilter = this.buildDateFilter(filters);

        const items = dateFilter
            ? allItems.filter((item) => {
                  const time = new Date(item.date).getTime();

                  if (dateFilter.gte && time < dateFilter.gte.getTime()) {
                      return false;
                  }

                  if (dateFilter.lte && time > dateFilter.lte.getTime()) {
                      return false;
                  }

                  return true;
              })
            : allItems;

        if (items.length === 0) {
            throw new BadRequestException(
                'Nenhuma NF de serviço encontrada nesse período.',
            );
        }

        return items;
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

        return this.runServiceSync(storeId);
    }

    // Núcleo da busca de NFS-e, sem checagem de usuário — usado tanto pelo
    // clique manual (syncFromSefaz acima, já validou acesso) quanto pelo job
    // automático (autoSyncServiceNf abaixo, que roda pro sistema inteiro sem
    // um usuário logado).
    private async runServiceSync(storeId: string) {
        const certificate = await this.prisma.storeCertificate.findUnique({
            where: { storeId },
        });

        if (!certificate) {
            throw new BadRequestException(
                'Essa loja não tem certificado digital cadastrado. Cadastre em Cadastros → Lojas antes de buscar as NFs.',
            );
        }

        // Mesma regra da distribuição de NF-e: depois de "nada de novo" ou
        // de uma rejeição, só vale tentar de novo depois de 1h — insistir
        // antes reinicia a contagem do bloqueio.
        if (certificate.nfseBlockedUntil && certificate.nfseBlockedUntil > new Date()) {
            throw new BadRequestException(
                `A Sefaz/ADN pediu espera depois da última consulta. Tente de novo às ${certificate.nfseBlockedUntil.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
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
            let response: Awaited<ReturnType<typeof fetchDistribution>>;

            try {
                response = await fetchDistribution(cert, cursor);
            } catch (error: any) {
                // Rejeição do ADN (inclui possível bloqueio por excesso de
                // consultas) — guarda o cursor já avançado e o cooldown
                // antes de propagar o erro.
                await this.prisma.storeCertificate.update({
                    where: { storeId },
                    data: {
                        lastNsu: cursor,
                        nfseBlockedUntil: new Date(Date.now() + SEFAZ_COOLDOWN_MS),
                    },
                });

                throw new BadRequestException(
                    String(error?.message || error),
                );
            }

            if (response.StatusProcessamento === 'NENHUM_DOCUMENTO_LOCALIZADO') {
                await this.prisma.storeCertificate.update({
                    where: { storeId },
                    data: {
                        lastNsu: cursor,
                        nfseBlockedUntil: new Date(Date.now() + SEFAZ_COOLDOWN_MS),
                    },
                });
                break;
            }

            const lote = response.LoteDFe || [];

            if (lote.length === 0) {
                await this.prisma.storeCertificate.update({
                    where: { storeId },
                    data: {
                        lastNsu: cursor,
                        nfseBlockedUntil: new Date(Date.now() + SEFAZ_COOLDOWN_MS),
                    },
                });
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
                let parsedNfse: ReturnType<typeof parseNfseXml> = null;

                if (item.ArquivoXml) {
                    const xml = decodeArquivoXml(item.ArquivoXml);
                    const fileName = `sefaz-${item.ChaveAcesso}.xml`;

                    writeFileSync(
                        join(incomingNfPath, fileName),
                        xml,
                        'utf-8',
                    );

                    fileUrl = `/uploads/services/${fileName}`;

                    // Só documentos de verdade (NFSE) trazem os dados de
                    // prestador/valor que interessam pro card de
                    // conciliação — eventos (cancelamento etc.) não.
                    if (item.TipoDocumento === 'NFSE') {
                        parsedNfse = parseNfseXml(xml);
                    }
                }

                const parsedIssueDate = parseIssueDate(parsedNfse?.issueDate);

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
                        numeroNf: parsedNfse?.numeroNf,
                        issuerName: parsedNfse?.issuerName,
                        issuerDoc: parsedNfse?.issuerDoc,
                        value: parsedNfse?.value,
                        issueDate: parsedIssueDate,
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
                        numeroNf: parsedNfse?.numeroNf,
                        issuerName: parsedNfse?.issuerName,
                        issuerDoc: parsedNfse?.issuerDoc,
                        value: parsedNfse?.value,
                        issueDate: parsedIssueDate,
                    },
                });

                fetchedTotal += 1;

                if (item.TipoDocumento === 'NFSE') {
                    nfseCount += 1;
                }
            }

            cursor = maxNsuInBatch + 1n;

            // Salva o progresso a cada lote — se a próxima consulta for
            // rejeitada, o que já avançou aqui não se perde.
            await this.prisma.storeCertificate.update({
                where: { storeId },
                data: { lastNsu: cursor },
            });

            // Ainda tem lote pela frente — espera antes de consultar de
            // novo, pra não martelar o webservice nacional.
            await sleep(SERVICE_SYNC_DELAY_MS);
        }

        return {
            fetchedTotal,
            nfseCount,
        };
    }

    // Mesmo espírito do autoSyncGoodsNf (purchases.service.ts): roda sozinho
    // a cada 10 minutos pra toda loja com certificado fora de cooldown (ver
    // nfseBlockedUntil), sem precisar de ninguém clicando "Buscar" no
    // horário certo. Todo resultado fica em SefazSyncLog.
    @Cron(CronExpression.EVERY_10_MINUTES)
    async autoSyncServiceNf() {
        const now = new Date();

        const certificates = await this.prisma.storeCertificate.findMany({
            where: {
                OR: [{ nfseBlockedUntil: null }, { nfseBlockedUntil: { lte: now } }],
            },
        });

        for (const certificate of certificates) {
            try {
                const result = await this.runServiceSync(certificate.storeId);

                await this.logSefazSync(
                    certificate.storeId,
                    'NFSE_SERVICO',
                    true,
                    result.fetchedTotal > 0
                        ? `${result.fetchedTotal} documento(s) novo(s) encontrado(s).`
                        : 'Busca automática rodou, nenhum documento novo.',
                    result.fetchedTotal,
                );
            } catch (error: any) {
                await this.logSefazSync(
                    certificate.storeId,
                    'NFSE_SERVICO',
                    false,
                    String(error?.message || error),
                    0,
                );
            }
        }
    }

    private async logSefazSync(
        storeId: string,
        source: 'NFE_COMPRA' | 'NFSE_SERVICO',
        success: boolean,
        message: string,
        fetchedTotal: number,
    ) {
        try {
            await this.prisma.sefazSyncLog.create({
                data: { storeId, source, success, message, fetchedTotal },
            });
        } catch {
            // O log é só auxiliar — nunca deve derrubar a sincronização.
        }
    }

    // accepted=false (padrão): só pendentes. accepted=true: aba "NFs
    // Aceitas" — tudo que já saiu do pendente (conciliada, aceita sem conta
    // ou aceita com conta). Recusada (ignored) não aparece em nenhuma.
    async findIncomingNf(
        user: any,
        filters?: {
            storeId?: string;
            page?: number;
            pageSize?: number;
            accepted?: boolean;
        },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        const page = filters?.page && filters.page > 0 ? filters.page : 1;
        const pageSize =
            filters?.pageSize && filters.pageSize > 0
                ? filters.pageSize
                : 20;

        const where = filters?.accepted
            ? {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                tipoDocumento: 'NFSE',
                ignored: false,
                OR: [
                    { serviceId: { not: null } },
                    { billId: { not: null } },
                    { accepted: true },
                ],
            }
            : {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                tipoDocumento: 'NFSE',
                serviceId: null,
                billId: null,
                accepted: false,
                ignored: false,
            };

        const [items, total] = await Promise.all([
            this.prisma.incomingServiceNf.findMany({
                where,
                // Ordena pela data de emissão da NF (a que aparece no
                // card) — cai pra generatedAt como desempate de quem ainda
                // não tem issueDate estruturado. nulls: 'last' evita que
                // registros sem data reconhecida pulem pro topo da lista
                // (padrão do Postgres em DESC é nulls primeiro).
                orderBy: [
                    { issueDate: { sort: 'desc', nulls: 'last' } },
                    { generatedAt: { sort: 'desc', nulls: 'last' } },
                ],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.incomingServiceNf.count({ where }),
        ]);

        // Backfill pra quem já foi capturado antes de eu adicionar os
        // campos estruturados (número, prestador, valor, data de emissão):
        // reaproveita o XML já salvo em disco em vez de precisar buscar de
        // novo na Sefaz. Roda pra quem ainda não tem numeroNf OU nome do
        // prestador — separado de propósito (não só "!numeroNf") porque uma
        // versão anterior do parser gravava numeroNf certo mas deixava o
        // nome em branco; assim quem ficou com nome vazio tenta de novo.
        for (const item of items) {
            if ((item.numeroNf && item.issuerName) || !item.fileUrl) continue;

            try {
                const fileName = item.fileUrl.split('/').pop();
                if (!fileName) continue;

                const xml = readFileSync(
                    join(incomingNfPath, fileName),
                    'utf-8',
                );
                const parsedNfse = parseNfseXml(xml);

                if (!parsedNfse) continue;

                const parsedIssueDate = parseIssueDate(parsedNfse.issueDate);

                const updated = await this.prisma.incomingServiceNf.update({
                    where: { id: item.id },
                    data: {
                        numeroNf: parsedNfse.numeroNf,
                        issuerName: parsedNfse.issuerName,
                        issuerDoc: parsedNfse.issuerDoc,
                        value: parsedNfse.value,
                        issueDate: parsedIssueDate,
                    },
                });

                Object.assign(item, updated);
            } catch {
                // Backfill é só uma melhoria de exibição — se o arquivo não
                // existir mais ou algo falhar, segue com o que já tinha.
            }
        }

        // BigInt não serializa em JSON por padrão — convertemos antes de
        // devolver pro front.
        return {
            items: items.map((item) => ({
                ...item,
                nsu: item.nsu.toString(),
            })),
            total,
            page,
            pageSize,
        };
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

    // "Recusar" — some da lista de pendências sem apagar o registro (fica
    // guardado caso precise investigar depois). Mesmo padrão do "não é
    // nossa" da NF de compra.
    async ignoreIncomingNf(incomingNfId: string, user: any) {
        const incoming = await this.prisma.incomingServiceNf.findUnique({
            where: { id: incomingNfId },
        });

        if (!incoming) {
            throw new NotFoundException('Documento não encontrado.');
        }

        this.ensureStoreAccess(incoming.storeId, user);

        const updated = await this.prisma.incomingServiceNf.update({
            where: { id: incomingNfId },
            data: { ignored: true },
        });

        return { ...updated, nsu: updated.nsu.toString() };
    }

    // "Aceitar" — alternativa a vincular a um Serviço já cadastrado.
    // generateBill = false: só marca como aceita (some da lista pendente,
    // sem criar nada em Contas a Pagar). generateBill = true: cria a Conta
    // a Pagar direto a partir da NF (prestador/valor tirados da própria
    // NF, categoria e vencimento informados na hora).
    async acceptIncomingNf(
        incomingNfId: string,
        dto: AcceptIncomingNfDto,
        user: any,
    ) {
        const incoming = await this.prisma.incomingServiceNf.findUnique({
            where: { id: incomingNfId },
        });

        if (!incoming) {
            throw new NotFoundException('Documento não encontrado.');
        }

        this.ensureStoreAccess(incoming.storeId, user);

        if (!dto.generateBill) {
            const updated = await this.prisma.incomingServiceNf.update({
                where: { id: incomingNfId },
                data: { accepted: true },
            });

            return { ...updated, nsu: updated.nsu.toString() };
        }

        if (!dto.dueDate) {
            throw new BadRequestException(
                'Informe a data de vencimento da conta.',
            );
        }

        const supplierName = dto.supplierName?.trim() || incoming.issuerName;

        if (!supplierName) {
            throw new BadRequestException(
                'Informe a empresa (prestador) da conta.',
            );
        }

        const supplier = await this.suppliersService.findOrCreate(supplierName);

        let categoryId: string | undefined;

        if (dto.categoryName?.trim()) {
            const category = await this.billCategoriesService.findOrCreate(
                dto.categoryName.trim(),
            );
            categoryId = category.id;
        }

        const { type, paymentMethod } = derivePaymentDefaults(dto);

        const bill = await this.billsService.create(
            {
                description: `NF de serviço — ${supplier.name}`,
                value: Number(incoming.value || 0),
                type,
                paymentMethod,
                dueDate: dto.dueDate,
                storeId: incoming.storeId,
                supplierId: supplier.id,
                categoryId,
                barcode: dto.barcode,
                pixKey: dto.pixKey,
                pixKeyType: dto.pixKeyType,
            },
            user,
        );

        const updated = await this.prisma.incomingServiceNf.update({
            where: { id: incomingNfId },
            data: { billId: bill.id },
        });

        return { ...updated, nsu: updated.nsu.toString() };
    }

    // "Resumo legível" — parseia o XML da NFS-e já salvo em disco na hora
    // (não persiste nada novo), devolvendo prestador/tomador/serviço/valores
    // com bem mais detalhe que os campos terços guardados no banco pra
    // listagem. Sem XML salvo, ou parse falhando, cai pro resumo com o que
    // já está no banco.
    async viewIncomingNf(incomingNfId: string, user: any) {
        const incoming = await this.prisma.incomingServiceNf.findUnique({
            where: { id: incomingNfId },
        });

        if (!incoming) {
            throw new NotFoundException('Documento não encontrado.');
        }

        this.ensureStoreAccess(incoming.storeId, user);

        const parsed = this.parseNfseFileForView(incoming.fileUrl);

        return {
            source: parsed ? 'xml' : 'resumo',
            resumo: {
                chaveAcesso: incoming.chaveAcesso,
                tipoDocumento: incoming.tipoDocumento,
                numeroNf: incoming.numeroNf,
                issuerName: incoming.issuerName,
                issuerDoc: incoming.issuerDoc,
                value: incoming.value ? Number(incoming.value) : undefined,
                issueDate: incoming.issueDate,
            },
            nf: parsed,
        };
    }

    // Mesma ideia, mas pra NF anexada manualmente num Serviço já cadastrado
    // (attachNf/uploadNf) — que pode ser XML de NFS-e, mas também pode ser
    // PDF/imagem (upload manual aceita os dois). Só tenta o parser legível
    // quando o arquivo parece ser XML.
    async viewService(id: string, user: any) {
        const service = await this.ensureServiceAccess(id, user);

        if (!service.nfFileUrl) {
            return { source: 'nenhum', resumo: null, nf: null };
        }

        const looksLikeXml = /\.xml$/i.test(service.nfFileUrl);

        if (!looksLikeXml) {
            return {
                source: 'arquivo',
                resumo: {
                    fileUrl: service.nfFileUrl,
                    originalName: service.nfOriginalName,
                },
                nf: null,
            };
        }

        const parsed = this.parseNfseFileForView(service.nfFileUrl);

        return {
            source: parsed ? 'xml' : 'arquivo',
            resumo: {
                fileUrl: service.nfFileUrl,
                originalName: service.nfOriginalName,
                providerName: service.providerName,
                value: Number(service.value),
                serviceDate: service.serviceDate,
            },
            nf: parsed,
        };
    }

    private parseNfseFileForView(fileUrl: string | null): NfseView | null {
        if (!fileUrl) return null;

        const relativePath = fileUrl.replace(/^\/uploads\//, '');
        const filePath = join(process.cwd(), 'uploads', relativePath);

        if (!existsSync(filePath)) return null;

        try {
            const xml = readFileSync(filePath, 'utf-8');
            return parseNfseForView(xml);
        } catch {
            return null;
        }
    }
}
