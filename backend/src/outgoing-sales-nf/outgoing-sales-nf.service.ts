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
import { parseFullNfeForView, parseFullNfeXml, type NfeView } from '../stores/sefaz-nfe-client';

// Mesmo padrão dos outros XMLs importados/baixados: fica dentro de
// /uploads, num diretório próprio pra não misturar com a NF de compra.
const outgoingSalesNfPath = join(process.cwd(), 'uploads', 'sales-nfe');

if (!existsSync(outgoingSalesNfPath)) {
    mkdirSync(outgoingSalesNfPath, { recursive: true });
}

function extractReferenceMonth(issueDate: string): string {
    // dhEmi/dEmi sempre começa com "AAAA-MM-DD..." — extrai direto da
    // string em vez de passar por Date, pra não sofrer deslocamento de mês
    // por causa de conversão de fuso horário perto da virada do dia.
    const match = issueDate.match(/^(\d{4})-(\d{2})/);

    if (match) return `${match[1]}-${match[2]}`;

    const parsed = new Date(issueDate);

    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class OutgoingSalesNfService {
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

    async findAll(user: any, filters?: { storeId?: string }) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        return this.prisma.outgoingSalesNf.findMany({
            where: {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                ignored: false,
            },
            orderBy: { issueDate: 'desc' },
        });
    }

    // Importação em massa dos XMLs de venda (a loja é sempre a emitente).
    // Não existe distribuição automática confiável pra nota de saída, então
    // esse é o único caminho: exportar do sistema de venda/PDV e subir os
    // arquivos aqui. Ao final, recalcula o Faturamento (RevenueEntry) de
    // cada mês afetado, somando o valor de todas as NFs não ignoradas —
    // esse recálculo substitui um eventual lançamento manual daquele mês.
    async importXml(storeId: string, files: Express.Multer.File[], user: any) {
        if (!storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(storeId, user);

        if (!files || files.length === 0) {
            throw new BadRequestException('Envie pelo menos um arquivo XML.');
        }

        const store = await this.prisma.store.findUnique({
            where: { id: storeId },
        });

        if (!store) {
            throw new NotFoundException('Loja não encontrada.');
        }

        const storeCnpjDigits = (store.cnpj || '').replace(/\D/g, '');

        let imported = 0;
        const errors: { fileName: string; reason: string }[] = [];
        const affectedMonths = new Set<string>();

        for (const file of files) {
            const xml = file.buffer.toString('utf-8');
            const parsedNf = parseFullNfeXml(xml);

            if (!parsedNf) {
                errors.push({
                    fileName: file.originalname,
                    reason: 'Arquivo não é um XML de NF-e válido.',
                });
                continue;
            }

            if (!parsedNf.value || !parsedNf.issueDate) {
                errors.push({
                    fileName: file.originalname,
                    reason: 'XML sem valor total ou data de emissão.',
                });
                continue;
            }

            const issuerCnpjDigits = (parsedNf.issuerCnpj || '').replace(
                /\D/g,
                '',
            );

            if (
                storeCnpjDigits &&
                issuerCnpjDigits &&
                issuerCnpjDigits !== storeCnpjDigits
            ) {
                errors.push({
                    fileName: file.originalname,
                    reason:
                        'O CNPJ emitente dessa NF não é o CNPJ da loja ativa — parece ser uma NF de entrada, não de venda.',
                });
                continue;
            }

            const referenceMonth = extractReferenceMonth(parsedNf.issueDate);
            const fileName = `venda-${parsedNf.chaveAcesso}.xml`;

            writeFileSync(join(outgoingSalesNfPath, fileName), xml, 'utf-8');

            await this.prisma.outgoingSalesNf.upsert({
                where: {
                    storeId_chaveAcesso: {
                        storeId,
                        chaveAcesso: parsedNf.chaveAcesso,
                    },
                },
                update: {
                    tipoDocumento: parsedNf.tipoDocumento || '55',
                    recipientCnpj: parsedNf.recipientCnpj,
                    recipientName: parsedNf.recipientName,
                    value: parsedNf.value,
                    issueDate: new Date(parsedNf.issueDate),
                    referenceMonth,
                    situacao: parsedNf.situacao,
                    fileUrl: `/uploads/sales-nfe/${fileName}`,
                    ignored: false,
                },
                create: {
                    storeId,
                    chaveAcesso: parsedNf.chaveAcesso,
                    tipoDocumento: parsedNf.tipoDocumento || '55',
                    recipientCnpj: parsedNf.recipientCnpj,
                    recipientName: parsedNf.recipientName,
                    value: parsedNf.value,
                    issueDate: new Date(parsedNf.issueDate),
                    referenceMonth,
                    situacao: parsedNf.situacao,
                    fileUrl: `/uploads/sales-nfe/${fileName}`,
                    importedById: user.id,
                },
            });

            imported += 1;
            affectedMonths.add(referenceMonth);
        }

        const revenueUpdated: { month: string; total: number }[] = [];

        for (const month of affectedMonths) {
            const total = await this.recomputeRevenueForMonth(
                storeId,
                month,
                user,
            );
            revenueUpdated.push({ month, total });
        }

        return { imported, errors, revenueUpdated };
    }

    // "Importei por engano" — some da lista e do cálculo de Faturamento sem
    // apagar o registro (mesmo padrão do "não é nossa" da NF de compra).
    async ignore(id: string, user: any) {
        const item = await this.prisma.outgoingSalesNf.findUnique({
            where: { id },
        });

        if (!item) {
            throw new NotFoundException('NF de venda não encontrada.');
        }

        this.ensureStoreAccess(item.storeId, user);

        const updated = await this.prisma.outgoingSalesNf.update({
            where: { id },
            data: { ignored: true },
        });

        await this.recomputeRevenueForMonth(
            item.storeId,
            item.referenceMonth,
            user,
        );

        return updated;
    }

    // "Resumo legível" — parseia o XML já salvo em disco na hora (não
    // persiste nada novo). Sem XML salvo, ou parse falhando, cai pro
    // resumo com o que já está no banco.
    async view(id: string, user: any) {
        const item = await this.prisma.outgoingSalesNf.findUnique({
            where: { id },
        });

        if (!item) {
            throw new NotFoundException('NF de venda não encontrada.');
        }

        this.ensureStoreAccess(item.storeId, user);

        let parsed: NfeView | null = null;

        if (item.fileUrl) {
            const relativePath = item.fileUrl.replace(/^\/uploads\//, '');
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
                chaveAcesso: item.chaveAcesso,
                tipoDocumento: item.tipoDocumento,
                recipientName: item.recipientName,
                recipientCnpj: item.recipientCnpj,
                value: Number(item.value),
                issueDate: item.issueDate,
                situacao: item.situacao,
            },
            nf: parsed,
        };
    }

    private async recomputeRevenueForMonth(
        storeId: string,
        referenceMonth: string,
        user: any,
    ): Promise<number> {
        const aggregate = await this.prisma.outgoingSalesNf.aggregate({
            where: { storeId, referenceMonth, ignored: false },
            _sum: { value: true },
        });

        const total = Number(aggregate._sum.value || 0);

        await this.prisma.revenueEntry.upsert({
            where: { storeId_referenceMonth: { storeId, referenceMonth } },
            update: {
                grossRevenue: total,
                source: 'IMPORTED_XML',
            },
            create: {
                storeId,
                referenceMonth,
                grossRevenue: total,
                source: 'IMPORTED_XML',
                createdById: user.id,
            },
        });

        return total;
    }
}
