import { HttpException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { ContasEnviadasService } from './contas-enviadas.service';
import { PagamentosAvisadosService } from './pagamentos-avisados.service';
import { lerLinhaDigitavel } from './documento-parser';
import { lerDocumentoComIa, iaDocumentosConfigurada } from './documento-ia';
import type { DocumentoLido } from './documento-parser';
import { lerPdf, norm } from './entrada.util';

// =============================================================================
// Núcleo do recebimento automático (WhatsApp e e-mail): recebe UM arquivo,
// decide se é boleto/nota ou comprovante e cria a pendência no lugar certo —
// ninguém lança nada sozinho:
//   boleto / nota / cupom    → "Lançar contas"        (ContaEnviada)
//   comprovante de pagamento → "Registrar pagamentos" (PagamentoAvisado)
// A loja sai do CNPJ do documento (ou da única loja atendida pelo canal).
// =============================================================================

export type Canal = 'WHATSAPP' | 'EMAIL';
export type TipoEntrada = 'BOLETO_NOTA' | 'COMPROVANTE';
export type ArquivoRecebido = { buffer: Buffer; nome: string; mime: string };
export type Origem = { externoId: string; remetente?: string | null; nomeRemetente?: string | null; texto?: string | null; assunto?: string | null; chatId?: string | null };
export type Resultado = {
    status: 'OK' | 'DUPLICADO' | 'ERRO' | 'JA_PROCESSADO';
    tipo: TipoEntrada;
    mensagem: string;
    resumo?: string;
    loja?: string | null;
    // Para o WhatsApp perguntar a loja quando o documento não diz.
    entradaId?: string | null;
    semLoja?: boolean;
    total?: number;
};

// Palavras que não ajudam a diferenciar uma loja da outra pelo nome.
const PALAVRAS_GENERICAS = new Set(['LOJA', 'BAR', 'RESTAURANTE', 'NU', 'GALHO', 'NUGALHO', 'LTDA', 'ME', 'EIRELI', 'DO', 'DA', 'DE', 'DOS', 'DAS', 'E', 'FILIAL', 'MATRIZ', 'UNIDADE']);

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '');

const DICA_COMPROVANTE = /COMPROVANTE|\bPAGO\b|PAGUEI|PAGAMENTO (FEITO|REALIZADO|EFETUADO)|PIX (FEITO|ENVIADO|REALIZADO)|TRANSFERI|\bTED\b|RECIBO DE PAGAMENTO/;
const DICA_DOCUMENTO = /BOLETO|\bNOTA\b|\bNF\b|NF-?E|NFS-?E|DANFE|CUPOM|FATURA|\bCONTA\b|COBRANCA|DUPLICATA/;
// "Autenticação mecânica" fica de fora: todo boleto tem esse texto.
const TEXTO_COMPROVANTE = /COMPROVANTE (DE )?(PAGAMENTO|PIX|TRANSFERENCIA|TRANSACAO)|PIX (ENVIADO|REALIZADO|EFETUADO)|TRANSFERENCIA (REALIZADA|EFETUADA|ENVIADA)|PAGAMENTO (REALIZADO|EFETUADO|AGENDADO) COM SUCESSO|ID DA TRANSACAO|\bE2E\b|END TO END|AUTENTICACAO BANCARIA/;
const TEXTO_DOCUMENTO = /DANFE|NOTA FISCAL|NFS-?E|CUPOM FISCAL|DOCUMENTO AUXILIAR|RECIBO DO PAGADOR|FICHA DE COMPENSACAO|LINHA DIGITAVEL|CEDENTE|BENEFICIARIO.*VENCIMENTO/;

@Injectable()
export class RecebimentoAutomaticoService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly contasEnviadas: ContasEnviadasService,
        private readonly pagamentos: PagamentosAvisadosService,
    ) { }

    // Ordem: o que a pessoa escreveu (legenda/assunto/nome do arquivo) → texto
    // do PDF → padrão do canal (WhatsApp = comprovante, e-mail = boleto/nota).
    async classificar(canal: Canal, arquivo: ArquivoRecebido, origem: Origem): Promise<TipoEntrada | null> {
        const nome = (arquivo.nome || '').toLowerCase();
        if (/xml/.test(arquivo.mime) || nome.endsWith('.xml')) return 'BOLETO_NOTA';
        const dica = norm(`${origem.texto ?? ''} ${origem.assunto ?? ''} ${arquivo.nome ?? ''}`);
        const temComp = DICA_COMPROVANTE.test(dica);
        const temDoc = DICA_DOCUMENTO.test(dica);
        if (temComp && !temDoc) return 'COMPROVANTE';
        if (temDoc && !temComp) return 'BOLETO_NOTA';
        if (arquivo.mime === 'application/pdf' || nome.endsWith('.pdf')) {
            const t = norm(await lerPdf(arquivo.buffer));
            if (TEXTO_COMPROVANTE.test(t)) return 'COMPROVANTE';
            if (TEXTO_DOCUMENTO.test(t) || lerLinhaDigitavel(t)) return 'BOLETO_NOTA';
        }
        // Sem pista nenhuma (foto ou PDF escaneado sem legenda): a IA decide.
        return null;
    }

    // Lojas que o canal atende, em ordem de nome (é a numeração da pergunta
    // "de qual loja é?").
    async lojasDoCanal(empresaId: string, lojasCanal: string[]) {
        return this.prisma.store.findMany({
            where: { empresaId, active: true, ...(lojasCanal.length ? { id: { in: lojasCanal } } : {}) },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
    }

    // Loja citada num texto (legenda "Raiz", resposta "2" ou "anchieta"...).
    // Só devolve se der UMA loja só.
    async lojaPeloTexto(empresaId: string, texto: string | null | undefined, lojasCanal: string[], aceitarNumero = false) {
        const t = norm(texto ?? '').replace(/[^A-Z0-9 ]/g, ' ').trim();
        if (!t) return null;
        const lojas = await this.lojasDoCanal(empresaId, lojasCanal);
        if (aceitarNumero) {
            const m = /^\s*(\d{1,2})\s*$/.exec(t);
            if (m) return lojas[Number(m[1]) - 1] ?? null;
        }
        const palavras = new Set(t.split(/\s+/));
        const tokens = lojas.map((l) => norm(l.name).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((p) => p.length >= 3 && !PALAVRAS_GENERICAS.has(p)));
        const achadas = lojas.filter((_, i) => tokens[i].some((tk) => palavras.has(tk) && tokens.every((outros, j) => j === i || !outros.includes(tk))));
        return achadas.length === 1 ? achadas[0] : null;
    }

    async processar(empresaId: string, canal: Canal, arquivo: ArquivoRecebido, origem: Origem, lojasCanal: string[]): Promise<Resultado> {
        const ja = await this.prisma.entradaAutomatica.findUnique({ where: { externoId: origem.externoId }, select: { tipo: true } });
        if (ja) return { status: 'JA_PROCESSADO', tipo: ja.tipo as TipoEntrada, mensagem: 'Já processado.' };

        let tipo = await this.classificar(canal, arquivo, origem);
        let lidos: DocumentoLido[] | undefined;
        if (!tipo && iaDocumentosConfigurada()) {
            try {
                const lidosIa = (await lerDocumentoComIa({ buffer: arquivo.buffer, mimetype: arquivo.mime, originalname: arquivo.nome })) ?? [];
                const contas = lidosIa.filter((l) => l.tipoDocumento !== 'COMPROVANTE');
                tipo = lidosIa.length && !contas.length ? 'COMPROVANTE' : 'BOLETO_NOTA';
                if (contas.length) lidos = contas;
            } catch {
                // segue com o padrão do canal
            }
        }
        tipo ??= canal === 'WHATSAPP' ? 'COMPROVANTE' : 'BOLETO_NOTA';
        // "Raiz" / "Anchieta" escrito na legenda ou no assunto vale como loja
        // (o CNPJ do documento continua mandando, se tiver).
        const lojaTexto = await this.lojaPeloTexto(empresaId, `${origem.texto ?? ''} ${origem.assunto ?? ''}`, lojasCanal);
        const quem = [origem.nomeRemetente, origem.remetente].filter(Boolean).join(' · ');
        const enviadoPor = `${canal === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}${quem ? `: ${quem}` : ''}`.slice(0, 190);
        const obs = [origem.assunto, origem.texto].filter(Boolean).join(' — ').slice(0, 500) || undefined;
        const file = { buffer: arquivo.buffer, originalname: arquivo.nome, mimetype: arquivo.mime };

        let resultado: Resultado;
        let destinoId: string | null = null;
        let destinoIds: string[] = [];
        let storeId: string | null = null;
        let semLoja = false;
        let total = 1;
        try {
            if (tipo === 'BOLETO_NOTA') {
                const r = await this.contasEnviadas.registrar(empresaId, file, { enviadoPor, origem: canal, lojasCanal, observacao: obs, storePadrao: lojaTexto?.id ?? null, lidos });
                destinoId = r.id;
                destinoIds = r.contas.map((c) => c.id);
                storeId = r.storeId;
                semLoja = r.contas.some((c) => !c.storeId);
                total = r.total;
                const partes = [r.fornecedor, r.valor ? brl(r.valor) : null, r.vencimento ? `vence ${dataBR(r.vencimento)}` : null].filter(Boolean);
                resultado = { status: 'OK', tipo, mensagem: r.total > 1 ? `${r.total} contas registradas em Lançar contas.` : 'Registrado em Lançar contas.', resumo: partes.join(' — ') || undefined };
            } else {
                const r = await this.pagamentos.registrar(empresaId, file, { descricao: obs }, { avisadoPor: enviadoPor, lojasCanal, storePadrao: lojaTexto?.id ?? null });
                destinoId = r.id;
                destinoIds = [r.id];
                storeId = r.storeId;
                semLoja = !r.storeId;
                const partes = [!/^Não informado/.test(r.fornecedor) ? r.fornecedor : null, r.valor ? brl(r.valor) : null, r.dataPagamento ? `pago ${dataBR(r.dataPagamento)}` : null].filter(Boolean);
                resultado = { status: 'OK', tipo, mensagem: 'Registrado em Registrar pagamentos.', resumo: partes.join(' — ') || undefined };
            }
        } catch (e: any) {
            const msg = e instanceof HttpException ? String((e.getResponse() as any)?.message ?? e.message) : String(e?.message ?? e);
            resultado = { status: /já foi enviado/i.test(msg) ? 'DUPLICADO' : 'ERRO', tipo, mensagem: msg.slice(0, 300) };
        }
        if (storeId) {
            resultado.loja = (await this.prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }))?.name ?? null;
        }

        resultado.semLoja = resultado.status === 'OK' && semLoja;
        resultado.total = total;
        try {
            const entrada = await this.prisma.entradaAutomatica.create({
                data: {
                    chatId: origem.chatId ?? null,
                    destinoIds,
                    aguardandoLoja: resultado.semLoja,
                    empresaId, storeId, canal, externoId: origem.externoId,
                    remetente: origem.remetente?.slice(0, 120) ?? null,
                    nomeRemetente: origem.nomeRemetente?.slice(0, 120) ?? null,
                    assunto: (origem.assunto ?? origem.texto ?? null)?.slice(0, 300) ?? null,
                    arquivoNome: arquivo.nome?.slice(0, 200) ?? null,
                    tipo, status: resultado.status, mensagem: resultado.resumo ?? resultado.mensagem,
                    destinoTipo: destinoId ? (tipo === 'BOLETO_NOTA' ? 'CONTA_ENVIADA' : 'PAGAMENTO_AVISADO') : null,
                    destinoId,
                },
            });
            resultado.entradaId = entrada.id;
        } catch {
            // externoId repetido (duas entregas ao mesmo tempo): ignora
        }
        return resultado;
    }

    // Guarda o id da pergunta "de qual loja é?" (pra achar pela resposta).
    async marcarPergunta(entradaId: string, mensagemId: string | null) {
        if (!mensagemId) return;
        await this.prisma.entradaAutomatica.update({ where: { id: entradaId }, data: { perguntaMsgId: mensagemId } }).catch(() => null);
    }

    // Entrada esperando a loja: a citada na resposta ou a mais recente do
    // mesmo chat (últimas 6 h).
    async aguardandoLoja(empresaId: string, chatId: string, citadoId?: string | null) {
        if (citadoId) {
            const e = await this.prisma.entradaAutomatica.findFirst({ where: { empresaId, perguntaMsgId: citadoId, aguardandoLoja: true } });
            if (e) return e;
        }
        return this.prisma.entradaAutomatica.findFirst({
            where: { empresaId, chatId, aguardandoLoja: true, createdAt: { gte: new Date(Date.now() - 6 * 3600_000) } },
            orderBy: { createdAt: 'desc' },
        });
    }

    // Aplica a loja respondida nas contas/comprovantes daquela entrada (só
    // nos que ainda estão sem loja e pendentes).
    async aplicarLoja(entradaId: string, storeId: string) {
        const e = await this.prisma.entradaAutomatica.findUnique({ where: { id: entradaId } });
        if (!e) return 0;
        const ids = e.destinoIds.length ? e.destinoIds : e.destinoId ? [e.destinoId] : [];
        const r = e.destinoTipo === 'PAGAMENTO_AVISADO'
            ? await this.prisma.pagamentoAvisado.updateMany({ where: { id: { in: ids }, storeId: null }, data: { storeId } })
            : await this.prisma.contaEnviada.updateMany({ where: { id: { in: ids }, storeId: null, status: 'PENDENTE' }, data: { storeId, lojaPor: 'WHATSAPP' } });
        await this.prisma.entradaAutomatica.update({ where: { id: entradaId }, data: { aguardandoLoja: false, storeId } });
        return r.count;
    }

    ultimas(empresaId: string) {
        return this.prisma.entradaAutomatica.findMany({ where: { empresaId }, orderBy: { createdAt: 'desc' }, take: 60 });
    }
}
