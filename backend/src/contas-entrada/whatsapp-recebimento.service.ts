import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { RecebimentoAutomaticoService, Resultado } from './recebimento-automatico.service';

// =============================================================================
// WhatsApp de RECEBER boletos/comprovantes, pelo Evolution API (o mesmo
// servidor que o sistema já usa pra mandar mensagens — EVOLUTION_API_URL /
// EVOLUTION_API_KEY), mas com instâncias próprias: cada número conectado é
// uma instância "nfreceb-...", ligada por QR code na tela Recebimento
// automático. Um número pode atender uma loja ou várias (aí a loja de cada
// documento sai do CNPJ). Só reage a arquivo; texto/áudio/figurinha são
// ignorados e o número não conversa com ninguém.
//
//   WEBHOOK_BASE_URL  como o Evolution alcança este backend
//                     (ex.: http://backend:3000 no docker, ou a URL pública da API)
// =============================================================================

type Midia = { nome: string; mime: string; legenda: string; base64?: string };

@Injectable()
export class WhatsappRecebimentoService {
    private readonly log = new Logger('WhatsAppRecebimento');

    constructor(
        private readonly prisma: PrismaService,
        private readonly recebimento: RecebimentoAutomaticoService,
    ) { }

    get configurado() { return !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY); }

    private async chamar(metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown) {
        if (!this.configurado) throw new BadRequestException('WhatsApp não configurado no servidor (EVOLUTION_API_URL / EVOLUTION_API_KEY no .env do backend).');
        const base = process.env.EVOLUTION_API_URL!.replace(/\/+$/, '');
        const r = await fetch(`${base}${caminho}`, {
            method: metodo,
            headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY! },
            body: corpo === undefined ? undefined : JSON.stringify(corpo),
            signal: AbortSignal.timeout(30000),
        });
        const data = (await r.json().catch(() => ({}))) as any;
        if (!r.ok) {
            const err: any = new Error(`Evolution respondeu ${r.status}: ${JSON.stringify(data?.response?.message ?? data?.message ?? data).slice(0, 200)}`);
            err.status = r.status;
            throw err;
        }
        return data;
    }

    private webhookUrl(segredo: string) {
        const base = (process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
        return `${base}/integracoes/whatsapp-recebimento/webhook/${segredo}`;
    }

    // ------------------------------------------------------------ conexões
    async listar(empresaId: string) {
        const conexoes = await this.prisma.recebimentoWhatsapp.findMany({ where: { empresaId }, orderBy: { createdAt: 'asc' } });
        return Promise.all(conexoes.map(async (c) => ({ ...c, segredo: undefined, ...(await this.estado(c.instancia)) })));
    }

    async estado(instancia: string): Promise<{ estado: string; numeroAtual: string | null; erro?: string }> {
        if (!this.configurado) return { estado: 'sem_configuracao', numeroAtual: null };
        try {
            const r = await this.chamar('GET', `/instance/connectionState/${instancia}`);
            const estado = r?.instance?.state ?? r?.state ?? 'close';
            let numeroAtual: string | null = null;
            if (estado === 'open') {
                const f = await this.chamar('GET', `/instance/fetchInstances?instanceName=${encodeURIComponent(instancia)}`).catch(() => null);
                const inst = Array.isArray(f) ? f[0] : f;
                numeroAtual = String(inst?.ownerJid ?? inst?.instance?.owner ?? inst?.number ?? '').split('@')[0] || null;
            }
            return { estado, numeroAtual };
        } catch (e: any) {
            if (e?.status === 404) return { estado: 'nao_criada', numeroAtual: null };
            return { estado: 'erro', numeroAtual: null, erro: e?.message };
        }
    }

    private async daEmpresa(empresaId: string, id: string) {
        const c = await this.prisma.recebimentoWhatsapp.findFirst({ where: { id, empresaId } });
        if (!c) throw new NotFoundException('Conexão não encontrada.');
        return c;
    }

    private async lojasValidas(empresaId: string, storeIds?: string[]) {
        if (!Array.isArray(storeIds) || !storeIds.length) return [];
        const lojas = await this.prisma.store.findMany({ where: { empresaId, id: { in: storeIds } }, select: { id: true } });
        return lojas.map((l) => l.id);
    }

    async criar(empresaId: string, body: { nome?: string; storeIds?: string[] }) {
        if (!this.configurado) throw new BadRequestException('WhatsApp não configurado no servidor (EVOLUTION_API_URL / EVOLUTION_API_KEY no .env do backend).');
        const c = await this.prisma.recebimentoWhatsapp.create({
            data: {
                empresaId,
                nome: body?.nome?.trim() || 'WhatsApp do financeiro',
                instancia: `nfreceb-${randomBytes(5).toString('hex')}`,
                segredo: randomBytes(20).toString('hex'),
                storeIds: await this.lojasValidas(empresaId, body?.storeIds),
            },
        });
        return { id: c.id, ...(await this.conectar(empresaId, c.id)) };
    }

    async editar(empresaId: string, id: string, body: { nome?: string; storeIds?: string[]; ativo?: boolean }) {
        await this.daEmpresa(empresaId, id);
        await this.prisma.recebimentoWhatsapp.update({
            where: { id },
            data: {
                ...(body?.nome?.trim() ? { nome: body.nome.trim() } : {}),
                ...(body?.storeIds !== undefined ? { storeIds: await this.lojasValidas(empresaId, body.storeIds) } : {}),
                ...(typeof body?.ativo === 'boolean' ? { ativo: body.ativo } : {}),
            },
        });
        return { ok: true };
    }

    // Cria a instância (se precisar), aponta o webhook e devolve o QR code.
    async conectar(empresaId: string, id: string) {
        const c = await this.daEmpresa(empresaId, id);
        const webhook = { enabled: true, url: this.webhookUrl(c.segredo), byEvents: false, base64: true, events: ['MESSAGES_UPSERT'] };
        const existe = await this.chamar('GET', `/instance/connectionState/${c.instancia}`).then(() => true).catch((e) => (e?.status === 404 ? false : Promise.reject(e)));
        if (!existe) {
            const r = await this.chamar('POST', '/instance/create', { instanceName: c.instancia, integration: 'WHATSAPP-BAILEYS', qrcode: true, webhook });
            const qr = r?.qrcode?.base64 ?? null;
            if (qr) return { estado: 'connecting', qr };
        } else {
            await this.chamar('POST', `/webhook/set/${c.instancia}`, { webhook }).catch((e) => this.log.warn(`webhook/set: ${e?.message}`));
        }
        const st = await this.estado(c.instancia);
        if (st.estado === 'open') return { estado: 'open', qr: null, numero: st.numeroAtual };
        const r = await this.chamar('GET', `/instance/connect/${c.instancia}`);
        return { estado: 'connecting', qr: r?.base64 ?? null, codigo: r?.pairingCode ?? null };
    }

    // Tira o número da instância (pra conectar outro é só ler um QR novo).
    async desconectar(empresaId: string, id: string) {
        const c = await this.daEmpresa(empresaId, id);
        await this.chamar('DELETE', `/instance/logout/${c.instancia}`).catch(() => null);
        await this.prisma.recebimentoWhatsapp.update({ where: { id }, data: { numero: null } });
        return { ok: true };
    }

    async excluir(empresaId: string, id: string) {
        const c = await this.daEmpresa(empresaId, id);
        await this.chamar('DELETE', `/instance/logout/${c.instancia}`).catch(() => null);
        await this.chamar('DELETE', `/instance/delete/${c.instancia}`).catch(() => null);
        await this.prisma.recebimentoWhatsapp.delete({ where: { id } });
        return { ok: true };
    }

    private async enviarTexto(instancia: string, numero: string, texto: string) {
        try {
            await this.chamar('POST', `/message/sendText/${instancia}`, { number: numero, text: texto });
        } catch (e: any) {
            this.log.warn(`Não consegui responder ${numero}: ${e?.message}`);
        }
    }

    // ------------------------------------------------------------------ webhook
    async webhook(segredo: string, payload: any) {
        const c = await this.prisma.recebimentoWhatsapp.findUnique({ where: { segredo } });
        if (!c) throw new NotFoundException();
        if (!c.ativo) return { ok: true, ignorado: 'pausado' };
        const evento = String(payload?.event ?? '').toLowerCase().replace('_', '.');
        if (evento && evento !== 'messages.upsert') return { ok: true, ignorado: evento };

        const lista = Array.isArray(payload?.data) ? payload.data : payload?.data?.messages ?? [payload?.data];
        for (const msg of lista) {
            if (!msg?.key) continue;
            // Em segundo plano: o Evolution não precisa esperar a leitura do PDF.
            this.tratarMensagem(c, msg).catch(async (e) => {
                this.log.error(`Mensagem ${msg?.key?.id}: ${e?.message}`);
                await this.prisma.recebimentoWhatsapp.update({ where: { id: c.id }, data: { ultimoErro: String(e?.message ?? 'erro').slice(0, 300) } }).catch(() => null);
            });
        }
        return { ok: true };
    }

    private extrairMidia(msg: any): Midia | null {
        const m = msg?.message ?? {};
        const doc = m.documentMessage ?? m.documentWithCaptionMessage?.message?.documentMessage;
        const base64 = m.base64 ?? msg.base64 ?? undefined;
        if (doc) return { nome: doc.fileName || doc.title || 'documento.pdf', mime: doc.mimetype || 'application/pdf', legenda: doc.caption ?? '', base64 };
        if (m.imageMessage) {
            const ext = /png/.test(m.imageMessage.mimetype ?? '') ? 'png' : 'jpg';
            return { nome: `foto-${msg.key.id}.${ext}`, mime: m.imageMessage.mimetype || 'image/jpeg', legenda: m.imageMessage.caption ?? '', base64 };
        }
        return null;
    }

    private async baixar(instancia: string, msg: any, midia: Midia): Promise<Buffer> {
        if (midia.base64) return Buffer.from(String(midia.base64).replace(/^data:[^;]+;base64,/, ''), 'base64');
        const r = await this.chamar('POST', `/chat/getBase64FromMediaMessage/${instancia}`, { message: { key: msg.key }, convertToMp4: false });
        if (!r?.base64) throw new Error('O Evolution não devolveu o arquivo.');
        return Buffer.from(r.base64, 'base64');
    }

    private async tratarMensagem(c: { id: string; empresaId: string; instancia: string; storeIds: string[] }, msg: any) {
        const jid: string = msg.key.remoteJid ?? '';
        if (msg.key.fromMe || !jid || jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;
        const real: string = jid.endsWith('@lid') ? (msg.key.remoteJidAlt ?? msg.key.senderPn ?? jid) : jid;
        const numero = real.endsWith('@lid') ? real : real.split('@')[0];
        const midia = this.extrairMidia(msg);
        // Só arquivo (PDF, XML ou foto). O resto é ignorado em silêncio.
        if (!midia) return;
        if (!/pdf|image|xml/.test(midia.mime) && !/\.(pdf|xml|jpe?g|png)$/i.test(midia.nome)) return;

        const buffer = await this.baixar(c.instancia, msg, midia);
        const r: Resultado = await this.recebimento.processar(c.empresaId, 'WHATSAPP',
            { buffer, nome: midia.nome, mime: midia.mime },
            { externoId: `wa:${c.instancia}:${msg.key.id}`, remetente: numero.includes('@') ? numero : `+${numero}`, nomeRemetente: msg.pushName ?? null, texto: midia.legenda || null },
            c.storeIds);
        await this.prisma.recebimentoWhatsapp.update({ where: { id: c.id }, data: { ultimoEvento: new Date(), ultimoErro: null } });

        if (r.status === 'JA_PROCESSADO') return;
        const oque = r.tipo === 'COMPROVANTE' ? 'Comprovante' : 'Boleto/nota';
        const loja = r.loja ? ` (${r.loja})` : '';
        const texto =
            r.status === 'OK' ? `✅ ${oque} recebido${loja}${r.resumo ? `: ${r.resumo}` : ''}. Já está com o financeiro para conferir.${r.tipo === 'COMPROVANTE' && !midia.legenda && /image/.test(midia.mime) ? '\n(Se for boleto ou nota, mande de novo escrevendo "boleto" ou "nota" na legenda.)' : ''}`
                : r.status === 'DUPLICADO' ? `⚠️ Esse ${oque.toLowerCase()} já tinha sido enviado antes — não registrei de novo.`
                    : `❌ Não consegui registrar esse arquivo (${r.mensagem}). Pode mandar de novo ou falar com o financeiro?`;
        await this.enviarTexto(c.instancia, numero, texto);
    }
}
