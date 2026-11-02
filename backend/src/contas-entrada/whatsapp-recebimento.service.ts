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
// documento sai do CNPJ). Funciona em conversa direta e em GRUPO (todo mundo
// manda no mesmo grupo). A loja de cada documento sai, nesta ordem, do CNPJ
// do pagador/destinatário, da NF já cadastrada, do nome da loja escrito na
// legenda ("Raiz", "Anchieta") — e, se nada disso resolver, o número
// pergunta no próprio chat "de qual loja é?" e a resposta ("2" ou "Raiz")
// direciona. Fora isso, texto/áudio/figurinha são ignorados.
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

    async editar(empresaId: string, id: string, body: { nome?: string; storeIds?: string[]; ativo?: boolean; gruposPermitidos?: string[]; telefonesPermitidos?: string[]; aceitarPrivado?: boolean }) {
        await this.daEmpresa(empresaId, id);
        await this.prisma.recebimentoWhatsapp.update({
            where: { id },
            data: {
                ...(Array.isArray(body?.gruposPermitidos) ? { gruposPermitidos: body.gruposPermitidos.map(String).filter((g) => g.endsWith('@g.us')).slice(0, 100) } : {}),
                ...(Array.isArray(body?.telefonesPermitidos) ? { telefonesPermitidos: [...new Set(body.telefonesPermitidos.map((t) => String(t).replace(/\D/g, '')).filter((t) => t.length >= 8))].slice(0, 200) } : {}),
                ...(typeof body?.aceitarPrivado === 'boolean' ? { aceitarPrivado: body.aceitarPrivado } : {}),
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
            const r = await this.chamar('POST', '/instance/create', { instanceName: c.instancia, integration: 'WHATSAPP-BAILEYS', qrcode: true, webhook, groupsIgnore: false });
            const qr = r?.qrcode?.base64 ?? null;
            if (qr) return { estado: 'connecting', qr };
        } else {
            await this.chamar('POST', `/webhook/set/${c.instancia}`, { webhook }).catch((e) => this.log.warn(`webhook/set: ${e?.message}`));
            // Grupos precisam chegar (todas as lojas mandam no mesmo grupo).
            await this.chamar('POST', `/settings/set/${c.instancia}`, {
                rejectCall: false, groupsIgnore: false, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false,
            }).catch((e) => this.log.warn(`settings/set: ${e?.message}`));
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

    // Responde no chat (conversa ou grupo), citando a mensagem original
    // quando der. Devolve o id da mensagem enviada.
    // Grupos em que o número está (pra marcar de quais aceitar).
    async grupos(empresaId: string, id: string) {
        const c = await this.daEmpresa(empresaId, id);
        const r = await this.chamar('GET', `/group/fetchAllGroups/${c.instancia}?getParticipants=false`).catch((e) => {
            throw new BadRequestException(`Não consegui listar os grupos (${e?.message}). O número está conectado?`);
        });
        const lista: any[] = Array.isArray(r) ? r : r?.groups ?? [];
        return lista
            .map((g) => ({ id: String(g.id ?? g.jid ?? ''), nome: String(g.subject ?? g.name ?? g.id ?? '') }))
            .filter((g) => g.id.endsWith('@g.us'))
            .sort((a, b) => a.nome.localeCompare(b.nome));
    }

    // O mesmo telefone pode vir com/sem 55 e com/sem o 9: compara o final.
    private telefoneAutorizado(numero: string, lista: string[]) {
        const d = String(numero ?? '').replace(/\D/g, '');
        if (d.length < 8) return false;
        return lista.some((t) => t.slice(-8) === d.slice(-8));
    }

    private async enviarTexto(instancia: string, numero: string, texto: string, citar?: any): Promise<string | null> {
        const base = { number: numero, text: texto };
        try {
            const r = await this.chamar('POST', `/message/sendText/${instancia}`, citar?.key ? { ...base, quoted: { key: citar.key, message: citar.message ?? { conversation: '' } } } : base);
            return r?.key?.id ?? null;
        } catch (e: any) {
            if (citar?.key) return this.enviarTexto(instancia, numero, texto);
            this.log.warn(`Não consegui responder ${numero}: ${e?.message}`);
            return null;
        }
    }

    private textoDa(msg: any): string | null {
        const m = msg?.message ?? {};
        return m.conversation ?? m.extendedTextMessage?.text ?? null;
    }

    // Resposta à pergunta "de qual loja é?" (no grupo ou na conversa).
    private async tratarResposta(c: { empresaId: string; instancia: string; storeIds: string[] }, chat: string, msg: any) {
        const texto = this.textoDa(msg);
        if (!texto || texto.length > 60) return;
        const citado = msg?.message?.extendedTextMessage?.contextInfo?.stanzaId ?? null;
        const pendente = await this.recebimento.aguardandoLoja(c.empresaId, chat, citado);
        if (!pendente) return;
        const loja = await this.recebimento.lojaPeloTexto(c.empresaId, texto, c.storeIds, true);
        // Conversa normal do grupo: não responde nada.
        if (!loja) return;
        const n = await this.recebimento.aplicarLoja(pendente.id, loja.id);
        await this.enviarTexto(c.instancia, chat, `👍 Anotado: ${loja.name}${n > 1 ? ` (${n} contas)` : ''}.`, msg);
    }

    // ------------------------------------------------------------------ webhook
    async webhook(segredo: string, payload: any) {
        const c = await this.prisma.recebimentoWhatsapp.findUnique({ where: { segredo } });
        if (!c) throw new NotFoundException();
        if (!c.ativo) return { ok: true, ignorado: 'pausado' };
        const evento = String(payload?.event ?? '').toLowerCase().replace('_', '.');
        if (evento && evento !== 'messages.upsert') return { ok: true, ignorado: evento };

        const lista = Array.isArray(payload?.data) ? payload.data : payload?.data?.messages ?? [payload?.data];
        this.log.log(`Webhook ${c.instancia}: ${lista.length} mensagem(ns) — ${lista.map((m: any) => `${m?.key?.remoteJid ?? '?'}${m?.key?.fromMe ? ' (enviada pelo próprio número, ignorada)' : ''}`).join(', ')}`);
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

    private async tratarMensagem(c: { id: string; empresaId: string; instancia: string; storeIds: string[]; gruposPermitidos: string[]; telefonesPermitidos: string[]; aceitarPrivado: boolean }, msg: any) {
        const jid: string = msg.key.remoteJid ?? '';
        if (msg.key.fromMe || !jid || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;
        const grupo = jid.endsWith('@g.us');
        // Quem mandou: no grupo é o participante; na conversa, o próprio chat.
        const autor: string = grupo
            ? (msg.key.participantAlt ?? msg.key.participantPn ?? msg.key.participant ?? msg.participant ?? '')
            : jid.endsWith('@lid') ? (msg.key.remoteJidAlt ?? msg.key.senderPn ?? jid) : jid;
        const numero = autor.endsWith('@lid') || !autor ? autor : autor.split('@')[0];
        // Para onde responder: o grupo inteiro ou a pessoa.
        const chat = grupo ? jid : numero;
        // Filtros da conexão: só os grupos marcados / conversa privada.
        if (grupo && c.gruposPermitidos?.length && !c.gruposPermitidos.includes(jid)) return;
        if (!grupo && c.aceitarPrivado === false) return;

        const midia = this.extrairMidia(msg);
        // Texto: só interessa se for resposta à pergunta da loja.
        if (!midia) {
            await this.tratarResposta(c, chat, msg);
            return;
        }
        // Só arquivos de quem está autorizado (se a lista estiver preenchida).
        if (c.telefonesPermitidos?.length && !this.telefoneAutorizado(numero, c.telefonesPermitidos)) {
            this.log.log(`Arquivo de ${numero || 'desconhecido'} ignorado (não está nos telefones autorizados).`);
            return;
        }
        if (!/pdf|image|xml/.test(midia.mime) && !/\.(pdf|xml|jpe?g|png)$/i.test(midia.nome)) return;

        const buffer = await this.baixar(c.instancia, msg, midia);
        const r: Resultado = await this.recebimento.processar(c.empresaId, 'WHATSAPP',
            { buffer, nome: midia.nome, mime: midia.mime },
            { externoId: `wa:${c.instancia}:${msg.key.id}`, remetente: !numero ? null : numero.includes('@') ? numero : `+${numero}`, nomeRemetente: msg.pushName ?? null, texto: midia.legenda || null, chatId: chat },
            c.storeIds);
        await this.prisma.recebimentoWhatsapp.update({ where: { id: c.id }, data: { ultimoEvento: new Date(), ultimoErro: null } });

        // Não é boleto/nota/comprovante (foto de produto, propaganda...): silêncio.
        if (r.status === 'JA_PROCESSADO' || r.status === 'IGNORADO') return;
        const oque = r.tipo === 'COMPROVANTE' ? 'Comprovante' : 'Boleto/nota';

        // Não deu pra saber a loja: pergunta no chat.
        if (r.status === 'OK' && r.semLoja && r.entradaId) {
            const lojas = await this.recebimento.lojasDoCanal(c.empresaId, c.storeIds);
            const opcoes = lojas.map((l, i) => `${i + 1} - ${l.name}`).join('\n');
            const pergunta = `📍 ${r.total && r.total > 1 ? `${r.total} contas recebidas` : `${oque} recebido`}${r.resumo ? `: ${r.resumo}` : ''}.\nNão achei a loja no documento — *de qual loja é?* Responda esta mensagem com o número ou o nome:\n${opcoes}`;
            const idPergunta = await this.enviarTexto(c.instancia, chat, pergunta, msg);
            await this.recebimento.marcarPergunta(r.entradaId, idPergunta);
            return;
        }
        const loja = r.loja ? ` (${r.loja})` : '';
        const texto =
            r.status === 'OK' ? `✅ ${r.total && r.total > 1 ? `${r.total} contas recebidas` : `${oque} recebido`}${loja}${r.resumo ? `: ${r.resumo}` : ''}. Já está com o financeiro para conferir.${r.tipo === 'COMPROVANTE' && !midia.legenda && /image/.test(midia.mime) ? '\n(Se for boleto ou nota, mande de novo escrevendo "boleto" ou "nota" na legenda.)' : ''}`
                : r.status === 'DUPLICADO' ? `⚠️ Esse ${oque.toLowerCase()} já tinha sido enviado antes — não registrei de novo.`
                    : `❌ Não consegui registrar esse arquivo (${r.mensagem}). Pode mandar de novo ou falar com o financeiro?`;
        await this.enviarTexto(c.instancia, chat, texto, grupo ? msg : undefined);
    }
}
