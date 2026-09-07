import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { loadCertificate } from '../stores/sefaz-nfse-client';
import { parseFullNfeForView, type NfeView } from '../stores/sefaz-nfe-client';
import {
    buildAndSignLossNfe,
    type BuiltLossNfe,
    type LossNfeStoreData,
} from './loss-nfe-builder';
import { CreateLossDto } from './dto/create-loss.dto';
import { CreateLossNfeDto } from './dto/create-loss-nfe.dto';

// XML assinado das NF-e de baixa por perda — mesmo padrão de pasta das
// outras NF-e já guardadas em disco (purchases-nfe, services-nfe etc.).
const lossNfeUploadPath = join(process.cwd(), 'uploads', 'losses-nfe');

if (!existsSync(lossNfeUploadPath)) {
    mkdirSync(lossNfeUploadPath, { recursive: true });
}

// Além de quem registrou, só gestão pode apagar um registro (ex: foto
// errada, duplicado).
const MANAGE_ROLES: UserRole[] = [
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
];

// Quem recebe o aviso de nova perda registrada — Administrativo e
// Proprietário sempre entram automaticamente (acesso global, ver
// notifyStoreAccess), então só precisa listar Gerente aqui.
const LOSS_NOTIFY_ROLES: UserRole[] = [UserRole.GERENTE];

@Injectable()
export class LossesService {
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

        if (!allowedStoreIds) return;

        if (!allowedStoreIds.includes(storeId)) {
            throw new ForbiddenException('Você não tem acesso a esta loja.');
        }
    }

    private defaultInclude() {
        return {
            store: { select: { id: true, name: true } },
            reportedBy: { select: { id: true, name: true } },
        };
    }

    async create(dto: CreateLossDto, photoUrl: string | undefined, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        if (!photoUrl) {
            throw new BadRequestException(
                'A foto do que foi perdido é obrigatória.',
            );
        }

        const loss = await this.prisma.productLoss.create({
            data: {
                storeId: dto.storeId,
                description: dto.description,
                quantity: dto.quantity,
                unit: dto.unit,
                reason: dto.reason,
                unitValue: dto.unitValue,
                ncm: dto.ncm,
                photoUrl,
                occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
                reportedById: user.id,
            },
            include: this.defaultInclude(),
        });

        await this.notificationsService.notifyStoreAccess({
            storeId: loss.storeId,
            allowedRoles: LOSS_NOTIFY_ROLES,
            excludeUserId: user.id,
            title: 'Nova perda registrada',
            message: `${loss.reportedBy.name} registrou perda de "${loss.description}" (${Number(loss.quantity)}${loss.unit ? ` ${loss.unit}` : ''}) em ${loss.store.name}.`,
            type: NotificationType.LOSS_ADDED,
        });

        return loss;
    }

    async findAll(
        user: any,
        filters: { storeId?: string; month?: number; year?: number },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        const range = this.monthRange(filters.month, filters.year);

        return this.prisma.productLoss.findMany({
            where: {
                storeId:
                    filters.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                occurredAt: range,
            },
            orderBy: { occurredAt: 'desc' },
            include: this.defaultInclude(),
        });
    }

    // Intervalo do mês (1º dia 00:00 até 1º dia do mês seguinte) — só
    // aplica o filtro se vier mês e ano; senão volta tudo.
    private monthRange(month?: number, year?: number) {
        if (!month || !year) return undefined;

        const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
        const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));

        return { gte: start, lt: end };
    }

    // Base do relatório mensal (aba Relatório): mesma lista de findAll,
    // mas já soma quantidade por descrição pra facilitar montar a NF de
    // perda no final do mês.
    async monthlyReport(
        user: any,
        filters: { storeId: string; month: number; year: number },
    ) {
        this.ensureStoreAccess(filters.storeId, user);

        const range = this.monthRange(filters.month, filters.year);

        const losses = await this.prisma.productLoss.findMany({
            where: { storeId: filters.storeId, occurredAt: range },
            orderBy: { occurredAt: 'desc' },
            include: this.defaultInclude(),
        });

        const totalsByDescription = new Map<
            string,
            { description: string; unit: string | null; quantity: number }
        >();

        for (const loss of losses) {
            const key = `${loss.description.trim().toLowerCase()}__${loss.unit || ''}`;
            const existing = totalsByDescription.get(key);

            if (existing) {
                existing.quantity += Number(loss.quantity);
            } else {
                totalsByDescription.set(key, {
                    description: loss.description,
                    unit: loss.unit,
                    quantity: Number(loss.quantity),
                });
            }
        }

        return {
            losses,
            totals: Array.from(totalsByDescription.values()).sort((a, b) =>
                a.description.localeCompare(b.description),
            ),
        };
    }

    // ------------------------------------------------------------------
    // NF de Perda (baixa de estoque) — Fase 2: montar, assinar e guardar
    // o rascunho da NF-e (finNFe=6/tpNFDebito=07, Ajuste SINIEF 49/2025).
    // Envio pro webservice de autorização da Sefaz ainda não existe (fica
    // pra Fase 3) — por enquanto só gera e guarda o XML assinado, sempre
    // em ambiente de homologação, pra conferência antes de ir pra
    // produção de verdade.
    // ------------------------------------------------------------------

    // Perdas com valor unitário definido e que ainda não entraram em
    // nenhuma NF — é dessa lista que a tela de emissão escolhe os itens.
    async findEligibleLosses(user: any, storeId: string) {
        this.ensureStoreAccess(storeId, user);

        return this.prisma.productLoss.findMany({
            where: {
                storeId,
                lossNfeId: null,
                unitValue: { not: null },
            },
            orderBy: { occurredAt: 'desc' },
            include: this.defaultInclude(),
        });
    }

    // CRT (Código de Regime Tributário) da Sefaz: 1 = Simples Nacional,
    // 3 = Regime Normal (cobre tanto Presumido quanto Real — não existe
    // CRT específico pra Real). Sem TaxRegimeConfig vigente cadastrado,
    // assume 3 (lado mais conservador pra essa nota, já que nenhum dos
    // dois tem ICMS destacado aqui).
    private async determineCrt(storeId: string): Promise<1 | 3> {
        const now = new Date();

        const config = await this.prisma.taxRegimeConfig.findFirst({
            where: {
                storeId,
                effectiveFrom: { lte: now },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
            },
            orderBy: { effectiveFrom: 'desc' },
        });

        return config?.regime === 'SIMPLES' ? 1 : 3;
    }

    async createLossNfeDraft(dto: CreateLossNfeDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });

        if (!store) {
            throw new NotFoundException('Loja não encontrada.');
        }

        const missingFields: string[] = [];
        if (!store.cnpj) missingFields.push('CNPJ');
        if (!store.uf) missingFields.push('UF');
        if (!store.logradouro) missingFields.push('logradouro');
        if (!store.numero) missingFields.push('número');
        if (!store.bairro) missingFields.push('bairro');
        if (!store.municipio) missingFields.push('município');
        if (!store.codigoMunicipioIbge) missingFields.push('código IBGE do município');
        if (!store.cep) missingFields.push('CEP');

        if (missingFields.length > 0) {
            throw new BadRequestException(
                `Complete o cadastro fiscal da loja antes de gerar a NF de perda (faltando: ${missingFields.join(', ')}). Isso fica em Cadastros → Lojas.`,
            );
        }

        const certificate = await this.prisma.storeCertificate.findUnique({
            where: { storeId: dto.storeId },
        });

        if (!certificate) {
            throw new BadRequestException(
                'Essa loja não tem certificado digital cadastrado — ele é necessário pra assinar a NF de perda. Cadastre em Cadastros → Lojas.',
            );
        }

        if (!dto.justificativa?.trim()) {
            throw new BadRequestException(
                'Informe a justificativa da baixa (motivo da perda) — ela vai pro infAdFisco da nota.',
            );
        }

        const losses = await this.prisma.productLoss.findMany({
            where: {
                id: { in: dto.lossIds },
                storeId: dto.storeId,
                lossNfeId: null,
            },
        });

        if (losses.length !== dto.lossIds.length) {
            throw new BadRequestException(
                'Uma ou mais perdas selecionadas não existem ou já entraram em outra NF.',
            );
        }

        if (losses.some((loss) => loss.unitValue == null)) {
            throw new BadRequestException(
                'Todas as perdas selecionadas precisam ter valor unitário definido.',
            );
        }

        const crt = await this.determineCrt(dto.storeId);

        const cert = loadCertificate(certificate.filePath, {
            cipher: certificate.passwordCipher,
            iv: certificate.passwordIv,
            authTag: certificate.passwordAuthTag,
        });

        // Sem série de produção configurada ainda, usa 900 — convenção
        // comum de série de teste/homologação, só pra nunca colidir com
        // a série real que o time definir depois com o contador.
        const serie = store.lossNfeSerie ?? 900;
        const numero = (store.lossNfeNextNumber ?? 0) + 1;

        const storeData: LossNfeStoreData = {
            cnpj: store.cnpj!,
            nome: store.name,
            uf: store.uf!,
            logradouro: store.logradouro,
            numero: store.numero,
            complemento: store.complemento,
            bairro: store.bairro,
            municipio: store.municipio,
            codigoMunicipioIbge: store.codigoMunicipioIbge,
            cep: store.cep,
            inscricaoEstadual: store.inscricaoEstadual,
            crt,
        };

        let built: BuiltLossNfe;

        try {
            built = buildAndSignLossNfe(cert, {
                store: storeData,
                serie,
                numero,
                // Sempre homologação por enquanto — emitir em produção
                // exige decidir a série real com o contador primeiro
                // (combinado com o usuário).
                tpAmb: 2,
                justificativa: dto.justificativa.trim(),
                itens: losses.map((loss) => ({
                    descricao: loss.description,
                    ncm: loss.ncm || undefined,
                    quantidade: Number(loss.quantity),
                    unidade: loss.unit || 'UN',
                    valorUnitario: Number(loss.unitValue),
                })),
            });
        } catch (error: any) {
            throw new BadRequestException(
                `Não foi possível montar/assinar a NF de perda: ${error?.message || error}`,
            );
        }

        const fileName = `${built.chaveAcesso}.xml`;
        writeFileSync(join(lossNfeUploadPath, fileName), built.xml, 'utf-8');

        const [lossNfe] = await this.prisma.$transaction([
            this.prisma.lossNfe.create({
                data: {
                    storeId: dto.storeId,
                    status: 'RASCUNHO',
                    ambiente: 2,
                    serie,
                    numero,
                    chaveAcesso: built.chaveAcesso,
                    issueDate: new Date(),
                    justificativa: dto.justificativa.trim(),
                    xmlFileUrl: `/uploads/losses-nfe/${fileName}`,
                    createdById: user.id,
                },
            }),
            this.prisma.store.update({
                where: { id: dto.storeId },
                data: { lossNfeSerie: serie, lossNfeNextNumber: numero },
            }),
        ]);

        await this.prisma.productLoss.updateMany({
            where: { id: { in: dto.lossIds } },
            data: { lossNfeId: lossNfe.id },
        });

        return { ...lossNfe, valorTotal: built.valorTotal };
    }

    async findLossNfes(user: any, storeId?: string) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (storeId) {
            this.ensureStoreAccess(storeId, user);
        }

        return this.prisma.lossNfe.findMany({
            where: {
                storeId: storeId || (allowedStoreIds ? { in: allowedStoreIds } : undefined),
            },
            orderBy: { createdAt: 'desc' },
            include: {
                store: { select: { id: true, name: true } },
                createdBy: { select: { id: true, name: true } },
                losses: true,
            },
        });
    }

    async findLossNfeById(id: string, user: any) {
        const lossNfe = await this.prisma.lossNfe.findUnique({
            where: { id },
            include: {
                store: { select: { id: true, name: true } },
                createdBy: { select: { id: true, name: true } },
                losses: true,
            },
        });

        if (!lossNfe) {
            throw new NotFoundException('NF de perda não encontrada.');
        }

        this.ensureStoreAccess(lossNfe.storeId, user);

        return lossNfe;
    }

    // Resumo legível da NF de perda — reaproveita o mesmo parser usado pra
    // ler NF-e de terceiros (parseFullNfeForView), já que o XML que a gente
    // mesmo monta segue a mesma estrutura padrão da NF-e. Mesmo formato de
    // retorno ({source, resumo, nf}) que os outros endpoints /view, pra dar
    // pra reusar o NfViewerModal do frontend sem modificação.
    async viewLossNfe(id: string, user: any) {
        const lossNfe = await this.findLossNfeById(id, user);

        let parsed: NfeView | null = null;

        if (lossNfe.xmlFileUrl) {
            const relativePath = lossNfe.xmlFileUrl.replace(/^\/uploads\//, '');
            const filePath = join(process.cwd(), 'uploads', relativePath);

            if (existsSync(filePath)) {
                try {
                    const xml = readFileSync(filePath, 'utf-8');
                    parsed = parseFullNfeForView(xml);
                } catch {
                    parsed = null;
                }
            }
        }

        return {
            source: parsed ? 'xml' : 'resumo',
            resumo: {
                chaveAcesso: lossNfe.chaveAcesso,
                tipoDocumento: '55',
                issuerName: lossNfe.store.name,
                value: lossNfe.losses.reduce(
                    (sum, loss) =>
                        sum + Number(loss.quantity) * Number(loss.unitValue || 0),
                    0,
                ),
                issueDate: lossNfe.issueDate,
                situacao: lossNfe.status,
            },
            nf: parsed,
        };
    }

    async remove(id: string, user: any) {
        const loss = await this.prisma.productLoss.findUnique({
            where: { id },
        });

        if (!loss) {
            throw new NotFoundException('Registro de perda não encontrado.');
        }

        this.ensureStoreAccess(loss.storeId, user);

        if (loss.reportedById !== user.id && !MANAGE_ROLES.includes(user.role)) {
            throw new ForbiddenException(
                'Só quem registrou ou a gestão pode apagar esse registro.',
            );
        }

        await this.prisma.productLoss.delete({ where: { id } });

        return { success: true };
    }
}
