import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { PrismaService } from '../../prisma/prisma.service';
import { loadCertificate } from '../stores/sefaz-nfse-client';
import { parseFullNfeForView, type NfeView } from '../stores/sefaz-nfe-client';
import {
    buildAndSignDevolucaoNfe,
    type BuiltDevolucaoNfe,
    type DevolucaoNfeStoreData,
    type DevolucaoNfeFornecedorData,
} from './devolucao-nfe-builder';
import { sugerirCfopDevolucao } from './cfop-devolucao';
import { CreateDevolucaoNfeDto } from './dto/create-devolucao-nfe.dto';

// XML assinado das NF-e de devolução — mesmo padrão de pasta das outras
// NF-e já guardadas em disco (purchases-nfe, losses-nfe etc.).
const devolucaoNfeUploadPath = join(process.cwd(), 'uploads', 'devolucoes-nfe');

if (!existsSync(devolucaoNfeUploadPath)) {
    mkdirSync(devolucaoNfeUploadPath, { recursive: true });
}

const MANAGE_ROLES: UserRole[] = [
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
];

@Injectable()
export class DevolucoesService {
    constructor(private prisma: PrismaService) { }

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

    // Lê o XML completo salvo da NF de entrada e devolve tanto os dados
    // pra exibir na tela de seleção de itens (via NfeView, já usado no
    // NF-viewer) quanto pra montar o CFOP sugerido de cada item — sem
    // precisar guardar os itens de novo no banco, já que o XML original
    // já foi salvo em disco no momento da captura/sync.
    async getIncomingNfItems(incomingGoodsNfId: string, user: any) {
        const incoming = await this.prisma.incomingGoodsNf.findUnique({
            where: { id: incomingGoodsNfId },
        });

        if (!incoming) {
            throw new NotFoundException('NF de entrada não encontrada.');
        }

        this.ensureStoreAccess(incoming.storeId, user);

        if (!incoming.fileUrl) {
            throw new BadRequestException(
                'Essa NF ainda não tem o XML completo disponível (só o resumo). ' +
                'Espere a manifestação automática liberar o XML completo na Sefaz ' +
                'antes de criar uma devolução a partir dela.',
            );
        }

        const relativePath = incoming.fileUrl.replace(/^\/uploads\//, '');
        const filePath = join(process.cwd(), 'uploads', relativePath);

        if (!existsSync(filePath)) {
            throw new BadRequestException('Arquivo XML da NF não encontrado em disco.');
        }

        const xml = readFileSync(filePath, 'utf-8');
        const parsed = parseFullNfeForView(xml);

        if (!parsed || !parsed.detalhamentoCompleto) {
            throw new BadRequestException(
                'O XML dessa NF ainda é só o resumo, sem os itens completos. ' +
                'Espere a manifestação liberar o XML completo antes de devolver.',
            );
        }

        // Quantidade já devolvida por item, somando todas as devoluções
        // (rascunho ou não — mesmo em rascunho já reserva a quantidade,
        // pra não deixar devolver o mesmo item duas vezes sem perceber)
        // já criadas a partir dessa mesma NF de entrada.
        const jaDevolvido = await this.prisma.devolucaoNfeItem.groupBy({
            by: ['nItemOrigem'],
            where: {
                devolucaoNfe: {
                    incomingGoodsNfId,
                    status: { not: 'CANCELADA' },
                },
            },
            _sum: { quantidade: true },
        });

        const devolvidoPorItem = new Map<number, number>(
            jaDevolvido.map((item) => [
                item.nItemOrigem,
                Number(item._sum.quantidade || 0),
            ]),
        );

        const itens = parsed.itens.map((item) => {
            const nItem = Number(item.numero) || 0;
            const cfopSugerido = item.cfop ? sugerirCfopDevolucao(item.cfop) : null;

            return {
                nItemOrigem: nItem,
                descricao: item.descricao,
                ncm: item.ncm,
                cfopOrigem: item.cfop,
                cfopDevolucaoSugerido: cfopSugerido,
                quantidade: item.quantidade,
                unidade: item.unidade,
                valorUnitario: item.valorUnitario,
                quantidadeJaDevolvida: devolvidoPorItem.get(nItem) || 0,
            };
        });

        return {
            chaveAcesso: parsed.chaveAcesso,
            emitente: parsed.emitente,
            issueDate: parsed.issueDate,
            itens,
        };
    }

    async createDevolucaoDraft(dto: CreateDevolucaoNfeDto, user: any) {
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
                `Complete o cadastro fiscal da loja antes de gerar a NF de devolução (faltando: ${missingFields.join(', ')}). Isso fica em Cadastros → Lojas.`,
            );
        }

        const certificate = await this.prisma.storeCertificate.findUnique({
            where: { storeId: dto.storeId },
        });

        if (!certificate) {
            throw new BadRequestException(
                'Essa loja não tem certificado digital cadastrado — ele é necessário pra assinar a NF de devolução. Cadastre em Cadastros → Lojas.',
            );
        }

        if (!dto.motivo?.trim()) {
            throw new BadRequestException('Informe o motivo da devolução.');
        }

        const incoming = await this.prisma.incomingGoodsNf.findUnique({
            where: { id: dto.incomingGoodsNfId },
        });

        if (!incoming || incoming.storeId !== dto.storeId) {
            throw new NotFoundException('NF de entrada não encontrada pra essa loja.');
        }

        if (!incoming.fileUrl) {
            throw new BadRequestException('NF de entrada sem XML completo disponível.');
        }

        const relativePath = incoming.fileUrl.replace(/^\/uploads\//, '');
        const filePath = join(process.cwd(), 'uploads', relativePath);

        if (!existsSync(filePath)) {
            throw new BadRequestException('Arquivo XML da NF de entrada não encontrado em disco.');
        }

        const originalXml = readFileSync(filePath, 'utf-8');
        const originalParsed: NfeView | null = parseFullNfeForView(originalXml);

        if (!originalParsed || !originalParsed.emitente.cnpj) {
            throw new BadRequestException(
                'Não foi possível ler os dados do fornecedor a partir do XML original.',
            );
        }

        // Resolve o CFOP de cada item: usa o mapeamento automático se
        // existir; senão EXIGE que o front tenha mandado
        // cfopDevolucaoManual (nunca inventa um CFOP sozinho).
        const itensResolvidos = dto.itens.map((item) => {
            const sugerido = sugerirCfopDevolucao(item.cfopOrigem);
            const cfop = sugerido || item.cfopDevolucaoManual;

            if (!cfop) {
                throw new BadRequestException(
                    `Não há CFOP de devolução mapeado automaticamente pro CFOP de origem ${item.cfopOrigem} ` +
                    `(item "${item.descricao}"). Informe o CFOP de devolução manualmente pra esse item.`,
                );
            }

            return { ...item, cfopResolvido: cfop };
        });

        // Trava contra devolver mais do que a NF original tinha desse
        // item, somando o que já foi devolvido em devoluções anteriores
        // (rascunho ou não) da mesma NF.
        const jaDevolvido = await this.prisma.devolucaoNfeItem.groupBy({
            by: ['nItemOrigem'],
            where: {
                devolucaoNfe: {
                    incomingGoodsNfId: dto.incomingGoodsNfId,
                    status: { not: 'CANCELADA' },
                },
            },
            _sum: { quantidade: true },
        });

        const devolvidoPorItem = new Map<number, number>(
            jaDevolvido.map((item) => [
                item.nItemOrigem,
                Number(item._sum.quantidade || 0),
            ]),
        );

        for (const item of dto.itens) {
            const original = originalParsed.itens.find(
                (i) => Number(i.numero) === item.nItemOrigem,
            );

            if (!original || original.quantidade == null) {
                throw new BadRequestException(
                    `Item ${item.nItemOrigem} não encontrado na NF original.`,
                );
            }

            const jaDevolvidoQtd = devolvidoPorItem.get(item.nItemOrigem) || 0;
            const disponivel = original.quantidade - jaDevolvidoQtd;

            if (item.quantidade > disponivel + 0.0001) {
                throw new BadRequestException(
                    `Quantidade a devolver do item "${item.descricao}" (${item.quantidade}) ` +
                    `é maior do que o disponível (${disponivel.toFixed(3)} — já foram devolvidos ${jaDevolvidoQtd.toFixed(3)} de ${original.quantidade}).`,
                );
            }
        }

        const crt = await this.determineCrt(dto.storeId);

        const cert = loadCertificate(certificate.filePath, {
            cipher: certificate.passwordCipher,
            iv: certificate.passwordIv,
            authTag: certificate.passwordAuthTag,
        });

        // Sem série de produção configurada ainda, usa 901 (convenção de
        // teste/homologação, diferente da 900 já usada pela LossNfe pra
        // nunca colidir entre si) — decide a série real com o contador
        // antes de emitir em produção.
        const serie = store.devolucaoNfeSerie ?? 901;
        const numero = (store.devolucaoNfeNextNumber ?? 0) + 1;

        const storeData: DevolucaoNfeStoreData = {
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

        const fornecedorData: DevolucaoNfeFornecedorData = {
            cnpj: originalParsed.emitente.cnpj,
            nome: originalParsed.emitente.nome || incoming.issuerName || 'Fornecedor',
            uf: originalParsed.emitente.endereco?.uf,
            logradouro: originalParsed.emitente.endereco?.logradouro,
            numero: originalParsed.emitente.endereco?.numero,
            complemento: originalParsed.emitente.endereco?.complemento,
            bairro: originalParsed.emitente.endereco?.bairro,
            municipio: originalParsed.emitente.endereco?.municipio,
            codigoMunicipioIbge: originalParsed.emitente.endereco?.codigoMunicipioIbge,
            cep: originalParsed.emitente.endereco?.cep,
            inscricaoEstadual: originalParsed.emitente.inscricaoEstadual,
        };

        let built: BuiltDevolucaoNfe;

        try {
            built = buildAndSignDevolucaoNfe(cert, {
                store: storeData,
                fornecedor: fornecedorData,
                refChaveAcesso: incoming.chaveAcesso,
                serie,
                numero,
                // Sempre homologação por enquanto — mesma decisão já
                // tomada pra LossNfe, combinada com o usuário.
                tpAmb: 2,
                motivo: dto.motivo.trim(),
                itens: itensResolvidos.map((item) => ({
                    descricao: item.descricao,
                    ncm: item.ncm || undefined,
                    cfop: item.cfopResolvido,
                    quantidade: item.quantidade,
                    unidade: item.unidade,
                    valorUnitario: item.valorUnitario,
                })),
            });
        } catch (error: any) {
            throw new BadRequestException(
                `Não foi possível montar/assinar a NF de devolução: ${error?.message || error}`,
            );
        }

        const fileName = `${built.chaveAcesso}.xml`;
        writeFileSync(join(devolucaoNfeUploadPath, fileName), built.xml, 'utf-8');

        const [devolucaoNfe] = await this.prisma.$transaction([
            this.prisma.devolucaoNfe.create({
                data: {
                    storeId: dto.storeId,
                    incomingGoodsNfId: dto.incomingGoodsNfId,
                    refChaveAcesso: incoming.chaveAcesso,
                    status: 'RASCUNHO',
                    ambiente: 2,
                    serie,
                    numero,
                    chaveAcesso: built.chaveAcesso,
                    issueDate: new Date(),
                    motivo: dto.motivo.trim(),
                    xmlFileUrl: `/uploads/devolucoes-nfe/${fileName}`,
                    createdById: user.id,
                    itens: {
                        create: itensResolvidos.map((item) => ({
                            nItemOrigem: item.nItemOrigem,
                            descricao: item.descricao,
                            ncm: item.ncm,
                            cfopOrigem: item.cfopOrigem,
                            cfopDevolucao: item.cfopResolvido,
                            quantidade: item.quantidade,
                            unidade: item.unidade,
                            valorUnitario: item.valorUnitario,
                            valorTotal: Math.round(item.quantidade * item.valorUnitario * 100) / 100,
                        })),
                    },
                },
                include: { itens: true },
            }),
            this.prisma.store.update({
                where: { id: dto.storeId },
                data: { devolucaoNfeSerie: serie, devolucaoNfeNextNumber: numero },
            }),
        ]);

        return { ...devolucaoNfe, valorTotal: built.valorTotal };
    }

    async findDevolucaoNfes(user: any, storeId?: string) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (storeId) {
            this.ensureStoreAccess(storeId, user);
        }

        return this.prisma.devolucaoNfe.findMany({
            where: {
                storeId: storeId || (allowedStoreIds ? { in: allowedStoreIds } : undefined),
            },
            orderBy: { createdAt: 'desc' },
            include: {
                store: { select: { id: true, name: true } },
                createdBy: { select: { id: true, name: true } },
                itens: true,
                incomingGoodsNf: {
                    select: { id: true, issuerName: true, chaveAcesso: true },
                },
            },
        });
    }

    async findDevolucaoNfeById(id: string, user: any) {
        const devolucaoNfe = await this.prisma.devolucaoNfe.findUnique({
            where: { id },
            include: {
                store: { select: { id: true, name: true } },
                createdBy: { select: { id: true, name: true } },
                itens: true,
                incomingGoodsNf: {
                    select: { id: true, issuerName: true, chaveAcesso: true },
                },
            },
        });

        if (!devolucaoNfe) {
            throw new NotFoundException('NF de devolução não encontrada.');
        }

        this.ensureStoreAccess(devolucaoNfe.storeId, user);

        return devolucaoNfe;
    }

    async viewDevolucaoNfe(id: string, user: any) {
        const devolucaoNfe = await this.findDevolucaoNfeById(id, user);

        let parsed: NfeView | null = null;

        if (devolucaoNfe.xmlFileUrl) {
            const relativePath = devolucaoNfe.xmlFileUrl.replace(/^\/uploads\//, '');
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
                chaveAcesso: devolucaoNfe.chaveAcesso,
                tipoDocumento: '55',
                issuerName: devolucaoNfe.store.name,
                value: devolucaoNfe.itens.reduce(
                    (sum, item) => sum + Number(item.valorTotal),
                    0,
                ),
                issueDate: devolucaoNfe.issueDate,
                situacao: devolucaoNfe.status,
            },
            nf: parsed,
        };
    }

    // Cancela um rascunho de devolução — só permitido enquanto ainda é
    // RASCUNHO (não enviado pra Sefaz), já que depois de autorizada o
    // cancelamento exige o evento próprio (110111), que ainda não existe
    // nesse sistema (fica pra quando a Fase 3 - envio de autorização -
    // for implementada). Libera as quantidades pra poderem ser
    // devolvidas de novo em outra NF.
    async cancelDraft(id: string, user: any) {
        const devolucaoNfe = await this.findDevolucaoNfeById(id, user);

        if (!MANAGE_ROLES.includes(user.role)) {
            throw new ForbiddenException('Só a gestão pode cancelar uma NF de devolução.');
        }

        if (devolucaoNfe.status !== 'RASCUNHO') {
            throw new BadRequestException(
                'Só é possível cancelar uma devolução que ainda está em rascunho (não enviada pra Sefaz).',
            );
        }

        return this.prisma.devolucaoNfe.update({
            where: { id },
            data: { status: 'CANCELADA' },
        });
    }
}
