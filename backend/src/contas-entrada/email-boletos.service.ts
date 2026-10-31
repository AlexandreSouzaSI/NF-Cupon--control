import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';
import { decryptSecret, encryptSecret, EncryptedSecret } from '../stores/certificate-crypto.util';
import { RecebimentoAutomaticoService } from './recebimento-automatico.service';

// =============================================================================
// Robô do e-mail dos boletos (um por empresa, configurado na tela
// Recebimento automático): a cada 5 minutos lê os e-mails NÃO LIDOS, pega os
// anexos PDF / XML / foto, manda pro recebimento automático e marca como lido.
// A senha fica cifrada no banco (CERT_ENCRYPTION_KEY, a mesma do certificado).
// =============================================================================

const ANEXO_OK = /pdf|xml|image\/(jpe?g|png)/i;

@Injectable()
export class EmailBoletosService {
    private readonly log = new Logger('EmailBoletos');
    private rodando = new Set<string>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly recebimento: RecebimentoAutomaticoService,
    ) { }

    async status(empresaId: string) {
        const c = await this.prisma.recebimentoEmail.findUnique({ where: { empresaId } });
        if (!c) return null;
        const { senhaCifrada: _s, ...resto } = c;
        return resto;
    }

    async salvar(empresaId: string, body: { host?: string; port?: number | string; secure?: boolean; usuario?: string; senha?: string; storeIds?: string[]; ativo?: boolean }) {
        const atual = await this.prisma.recebimentoEmail.findUnique({ where: { empresaId } });
        const host = (body.host ?? atual?.host ?? '').trim();
        const usuario = (body.usuario ?? atual?.usuario ?? '').trim();
        if (!host || !usuario) throw new BadRequestException('Informe o servidor IMAP e o e-mail.');
        if (!atual && !body.senha) throw new BadRequestException('Informe a senha da caixa de e-mail.');
        const lojas = Array.isArray(body.storeIds)
            ? (await this.prisma.store.findMany({ where: { empresaId, id: { in: body.storeIds } }, select: { id: true } })).map((l) => l.id)
            : undefined;
        const dados = {
            host,
            usuario,
            port: Number(body.port ?? atual?.port ?? 993) || 993,
            secure: body.secure ?? atual?.secure ?? true,
            ...(body.senha ? { senhaCifrada: encryptSecret(body.senha) as any } : {}),
            ...(lojas ? { storeIds: lojas } : {}),
            ...(typeof body.ativo === 'boolean' ? { ativo: body.ativo } : {}),
        };
        if (atual) await this.prisma.recebimentoEmail.update({ where: { empresaId }, data: dados });
        else await this.prisma.recebimentoEmail.create({ data: { empresaId, ...dados, senhaCifrada: dados.senhaCifrada! } });
        return this.status(empresaId);
    }

    async remover(empresaId: string) {
        await this.prisma.recebimentoEmail.deleteMany({ where: { empresaId } });
        return { ok: true };
    }

    @Interval('email-boletos-nf', 5 * 60 * 1000)
    async agendado() {
        const caixas = await this.prisma.recebimentoEmail.findMany({ where: { ativo: true }, select: { empresaId: true } }).catch(() => []);
        for (const c of caixas) await this.verificar(c.empresaId).catch(() => null);
    }

    // Lê a caixa agora. Devolve quantos e-mails e anexos foram tratados.
    async verificar(empresaId: string) {
        const cfg = await this.prisma.recebimentoEmail.findUnique({ where: { empresaId } });
        if (!cfg) return { ok: false, erro: 'E-mail não configurado.' };
        if (!cfg.ativo) return { ok: false, erro: 'Recebimento por e-mail desligado.' };
        if (this.rodando.has(empresaId)) return { ok: false, erro: 'Já está verificando, aguarde.' };
        this.rodando.add(empresaId);
        let emails = 0, anexos = 0;
        let cliente: any = null;
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { ImapFlow } = require('imapflow');
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { simpleParser } = require('mailparser');
            cliente = new ImapFlow({
                host: cfg.host,
                port: cfg.port,
                secure: cfg.secure,
                auth: { user: cfg.usuario, pass: decryptSecret(cfg.senhaCifrada as unknown as EncryptedSecret) },
                logger: false,
            });
            await cliente.connect();
            const lock = await cliente.getMailboxLock('INBOX');
            try {
                const ids: number[] = (await cliente.search({ seen: false }, { uid: true })) || [];
                for (const uid of ids.slice(0, 50)) {
                    const msg = await cliente.fetchOne(String(uid), { source: true }, { uid: true });
                    if (!msg || !msg.source) continue;
                    const mail = await simpleParser(msg.source);
                    const de = mail.from?.value?.[0];
                    const base = mail.messageId || `uid-${uid}-${mail.date?.getTime() ?? ''}`;
                    const validos = (mail.attachments ?? []).filter((a: any) =>
                        (ANEXO_OK.test(a.contentType) || /\.(pdf|xml|jpe?g|png)$/i.test(a.filename ?? ''))
                        // logo/assinatura embutida no corpo do e-mail não é documento
                        && !(a.contentDisposition === 'inline' && /image/.test(a.contentType) && a.size < 40_000));
                    for (const [i, a] of validos.entries()) {
                        await this.recebimento.processar(empresaId, 'EMAIL',
                            { buffer: a.content, nome: a.filename || `anexo-${i + 1}`, mime: a.contentType },
                            { externoId: `mail:${empresaId}:${base}#${i}:${a.filename ?? ''}`.slice(0, 250), remetente: de?.address ?? null, nomeRemetente: de?.name || null, assunto: mail.subject ?? null },
                            cfg.storeIds);
                        anexos++;
                    }
                    await cliente.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
                    emails++;
                }
            } finally {
                lock.release();
            }
            await cliente.logout();
            await this.prisma.recebimentoEmail.update({ where: { empresaId }, data: { ultimoEvento: new Date(), ultimoErro: null } });
            return { ok: true, emails, anexos };
        } catch (e: any) {
            const erro = /Cannot find module/.test(e?.message ?? '')
                ? 'Falta instalar os pacotes do e-mail no servidor (npm install).'
                : e?.message ?? 'Falha ao ler a caixa de e-mail.';
            this.log.warn(`Falha ao ler a caixa (${cfg.usuario}): ${erro}`);
            await this.prisma.recebimentoEmail.update({ where: { empresaId }, data: { ultimoErro: String(erro).slice(0, 300) } }).catch(() => null);
            try { await cliente?.logout(); } catch { /* já caiu */ }
            return { ok: false, erro, emails, anexos };
        } finally {
            this.rodando.delete(empresaId);
        }
    }
}
