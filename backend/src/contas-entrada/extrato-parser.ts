import * as XLSX from 'xlsx';

// =============================================================================
// Leitura dos extratos pra Conciliação do Extrato (OFX de qualquer banco, ou
// as planilhas do Sicredi):
//  - COMPLETO: "Extrato" (.xls/.xlsx) — todas as movimentações da conta
//    (Pix, boletos, tarifas, transferências). É o que fecha o total do mês.
//  - PIX: "Movimentações PIX" (.xlsx) — só Pix, mas com o campo "Descrição"
//    digitado na hora do pagamento (onde vêm as placas).
// Mandando os dois, cada "PAGAMENTO PIX" do extrato completo ganha a
// descrição do relatório de Pix (casando por data + valor + nome).
// =============================================================================

export type TipoMov = 'PIX' | 'BOLETO' | 'TRANSFERENCIA' | 'TARIFA' | 'DEBITO' | 'OUTRO';

export type Movimento = {
    data: string; // AAAA-MM-DD
    hora: string | null;
    valor: number; // negativo = saída
    tipo: TipoMov;
    nome: string;
    documento: string | null; // CPF/CNPJ de quem recebeu/pagou
    descricao: string; // descrição do Pix (quando há) ou a linha do extrato
    linha: string; // texto original do extrato
};

export type ExtratoLido = {
    formato: 'COMPLETO' | 'PIX';
    banco: string;
    mes: string | null; // AAAA-MM
    saldoAnterior: number | null;
    saldoFinal: number | null;
    movimentos: Movimento[];
};

const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

function numero(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = String(v).replace(/R\$/g, '').replace(/\s/g, '');
    const neg = /^-|\(.*\)$/.test(s);
    s = s.replace(/[-()]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? (neg ? -n : n) : null;
}

function dataISO(v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') {
        const d = XLSX.SSF.parse_date_code(v);
        if (!d) return null;
        return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
    const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(v).trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function hora(v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') {
        const min = Math.round((v % 1) * 24 * 60);
        return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
    }
    const m = /(\d{1,2}):(\d{2})/.exec(String(v));
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

function linhasDaPlanilha(buffer: Buffer): unknown[][] {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
}

// "PAGAMENTO PIX 12938083696 Marcos Vinicius Magalh" → tipo, documento, nome
function quebrarLinha(texto: string): { tipo: TipoMov; documento: string | null; nome: string } {
    const t = texto.trim();
    const m = /^(PAGAMENTO PIX|RECEBIMENTO PIX|DEVOLUCAO PIX|LIQUIDACAO BOLETO(?: SICREDI)?|PAGAMENTO BOLETO|TRANSF(?:ERENCIA)? ENTRE CONTAS|TED|DOC)\s+(?:(\d{11,14})\s+)?(.*)$/i.exec(t);
    if (m) {
        const p = norm(m[1]);
        const tipo: TipoMov = p.includes('PIX') ? 'PIX' : p.includes('BOLETO') ? 'BOLETO' : 'TRANSFERENCIA';
        return { tipo, documento: m[2] ?? null, nome: (m[3] || t).trim() };
    }
    const n = norm(t);
    if (/TARIFA|CESTA|IOF|JUROS|ENCARGO/.test(n)) return { tipo: 'TARIFA', documento: null, nome: t };
    if (/DEBITO AUTOMATICO|DEB\.? AUT|CONVENIO/.test(n)) return { tipo: 'DEBITO', documento: null, nome: t };
    return { tipo: 'OUTRO', documento: null, nome: t };
}

function lerCompleto(rows: unknown[][]): ExtratoLido {
    const iCab = rows.findIndex((r) => norm(String(r[0] ?? '')) === 'DATA' && r.some((c) => /VALOR/.test(norm(String(c ?? '')))));
    const cab = rows[iCab].map((c) => norm(String(c ?? '')));
    const col = (re: RegExp, padrao: number) => { const i = cab.findIndex((c) => re.test(c)); return i >= 0 ? i : padrao; };
    const cData = col(/^DATA/, 0), cDesc = col(/DESCRI/, 1), cValor = col(/^VALOR/, 3), cSaldo = col(/^SALDO/, 4);

    let periodoMes: string | null = null;
    for (const r of rows.slice(0, iCab)) {
        const m = /PERIODO DE (\d{2})\/(\d{2})\/(\d{4})/.exec(norm(r.map((c) => String(c ?? '')).join(' ')));
        if (m) periodoMes = `${m[3]}-${m[2]}`;
    }

    let saldoAnterior: number | null = null;
    let saldoFinal: number | null = null;
    const movimentos: Movimento[] = [];
    for (const r of rows.slice(iCab + 1)) {
        const c0 = norm(String(r[0] ?? ''));
        // Fim da tabela: resumo de saldos / lançamentos futuros.
        if (/^SALDO DA CONTA|^LANCAMENTOS FUTUROS|^SALDO ATUAL/.test(c0)) break;
        const desc = String(r[cDesc] ?? '').trim();
        if (/^SALDO ANTERIOR/.test(norm(desc))) { saldoAnterior = numero(r[cSaldo]); continue; }
        const data = dataISO(r[cData]);
        const valor = numero(r[cValor]);
        if (!data || valor === null || !desc) continue;
        const s = numero(r[cSaldo]);
        if (s !== null) saldoFinal = s;
        const q = quebrarLinha(desc);
        movimentos.push({ data, hora: null, valor, tipo: q.tipo, nome: q.nome, documento: q.documento, descricao: desc, linha: desc });
    }
    return { formato: 'COMPLETO', banco: 'Sicredi', mes: periodoMes ?? mesMaisComum(movimentos), saldoAnterior, saldoFinal, movimentos };
}

function lerPix(rows: unknown[][]): ExtratoLido {
    const iCab = rows.findIndex((r) => r.some((c) => /NATUREZA DA TRANSACAO/.test(norm(String(c ?? '')))));
    const cab = rows[iCab].map((c) => norm(String(c ?? '')));
    const col = (re: RegExp) => cab.findIndex((c) => re.test(c));
    const cNat = col(/^NATUREZA/), cNome = col(/^NOME$/), cData = col(/^DATA$/), cHora = col(/^HORA$/), cValor = col(/^VALOR$/), cDesc = col(/^DESCRICAO$/);
    const movimentos: Movimento[] = [];
    for (const r of rows.slice(iCab + 1)) {
        const nat = norm(String(r[cNat] ?? ''));
        const data = dataISO(r[cData]);
        const v = numero(r[cValor]);
        if (!data || v === null || !/DEBITO|CREDITO/.test(nat)) continue;
        const valor = nat.startsWith('DEBITO') ? -Math.abs(v) : Math.abs(v);
        const nome = String(r[cNome] ?? '').trim();
        const descricao = cDesc >= 0 ? String(r[cDesc] ?? '').trim() : '';
        movimentos.push({ data, hora: hora(r[cHora]), valor, tipo: 'PIX', nome, documento: null, descricao, linha: `PIX ${nat} ${nome}` });
    }
    return { formato: 'PIX', banco: 'Sicredi', mes: mesMaisComum(movimentos), saldoAnterior: null, saldoFinal: null, movimentos };
}

function mesMaisComum(ms: Movimento[]): string | null {
    const c = new Map<string, number>();
    for (const m of ms) c.set(m.data.slice(0, 7), (c.get(m.data.slice(0, 7)) ?? 0) + 1);
    let melhor: string | null = null;
    for (const [k, n] of c) if (!melhor || n > (c.get(melhor) ?? 0)) melhor = k;
    return melhor;
}

// OFX (qualquer banco): cada <STMTTRN> vira um movimento. Funciona como o
// "extrato completo" (fecha o total do mês).
function lerOfx(texto: string): ExtratoLido {
    const tag = (bloco: string, nome: string) => {
        const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i').exec(bloco);
        return m ? m[1].trim() : '';
    };
    const banco = tag(texto, 'ORG') || tag(texto, 'BANKID') || 'OFX';
    const movimentos: Movimento[] = [];
    for (const m of texto.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|<\/BANKTRANLIST>)/gi)) {
        const b = m[1];
        const valor = numero(tag(b, 'TRNAMT').replace(',', '.'));
        const d = tag(b, 'DTPOSTED');
        if (valor === null || !/^\d{8}/.test(d)) continue;
        const data = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        const nome = tag(b, 'NAME');
        const memo = tag(b, 'MEMO');
        const desc = [nome, memo].filter(Boolean).join(' — ') || tag(b, 'TRNTYPE');
        const q = quebrarLinha(memo || nome || desc);
        const tipoOfx = norm(`${tag(b, 'TRNTYPE')} ${desc}`);
        const tipo: TipoMov = /PIX/.test(tipoOfx) ? 'PIX' : /BOLETO|TITULO|COBRANCA/.test(tipoOfx) ? 'BOLETO' : /TARIFA|CESTA|IOF|SRVCHG|FEE/.test(tipoOfx) ? 'TARIFA' : /TED|DOC|TRANSF|XFER/.test(tipoOfx) ? 'TRANSFERENCIA' : /DEBIT|DEB AUT/.test(tipoOfx) && q.tipo === 'OUTRO' ? 'DEBITO' : q.tipo;
        const nomeMov = (q.nome || nome || desc).slice(0, 200);
        // Descrição só quando acrescenta algo ao nome (evita "X — X").
        const descMov = norm(desc).replace(norm(nomeMov), '').replace(/[^A-Z0-9]/g, '').length < 4 ? '' : desc;
        movimentos.push({ data, hora: null, valor: Number(valor.toFixed(2)), tipo, nome: nomeMov, documento: q.documento, descricao: descMov, linha: desc });
    }
    if (!movimentos.length) throw new Error('O arquivo OFX não tem movimentações.');
    const saldo = numero(tag(texto, 'BALAMT').replace(',', '.'));
    return { formato: 'COMPLETO', banco, mes: mesMaisComum(movimentos), saldoAnterior: null, saldoFinal: saldo, movimentos };
}

export function lerExtrato(buffer: Buffer, nomeArquivo = ''): ExtratoLido {
    const inicio = buffer.subarray(0, 4000).toString('latin1');
    if (/\.ofx$/i.test(nomeArquivo) || /<OFX>|OFXHEADER/i.test(inicio)) return lerOfx(buffer.toString('latin1'));
    const rows = linhasDaPlanilha(buffer);
    const texto = (r: unknown[]) => norm(r.map((c) => String(c ?? '')).join(' '));
    if (rows.some((r) => /NATUREZA DA TRANSACAO/.test(texto(r)))) return lerPix(rows);
    if (rows.some((r) => norm(String(r[0] ?? '')) === 'DATA' && /DESCRI/.test(texto(r)) && /VALOR/.test(texto(r)))) return lerCompleto(rows);
    throw new Error('Formato de extrato não reconhecido. Envie o extrato em OFX (qualquer banco) ou, do Sicredi, o Extrato (.xls/.xlsx) e/ou o relatório de Movimentações PIX (.xlsx).');
}

const centavos = (v: number) => Math.round(v * 100);

// Junta o extrato completo com o relatório de Pix. Sem o completo, o Pix vira a base.
export function juntarExtratos(lidos: ExtratoLido[]): ExtratoLido & { pixCasados: number; pixSobrando: number } {
    const completo = lidos.find((l) => l.formato === 'COMPLETO');
    const pix = lidos.find((l) => l.formato === 'PIX');
    if (!completo) {
        if (!pix) throw new Error('Nenhum extrato enviado.');
        return { ...pix, pixCasados: 0, pixSobrando: 0 };
    }
    if (!pix) return { ...completo, pixCasados: 0, pixSobrando: 0 };

    const livres = pix.movimentos.filter((m) => m.valor < 0).map((m) => ({ m, usado: false }));
    const dias = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
    const chave = (s: string) => norm(s).replace(/[^A-Z0-9]/g, '');
    const alvo = completo.movimentos.map((m) => m.valor < 0 && (m.tipo === 'PIX' || m.tipo === 'TRANSFERENCIA'));
    const par: (typeof livres[number] | null)[] = completo.movimentos.map(() => null);
    // O extrato completo corta o nome (~22 letras) e às vezes lança o Pix 1 a
    // 3 dias depois (fim de semana / agendado). 1ª passada: mesmo dia;
    // 2ª: até 5 dias antes. Sempre mesmo valor, preferindo o mesmo nome.
    for (const janela of [0, 5]) {
        completo.movimentos.forEach((m, i) => {
            if (!alvo[i] || par[i]) return;
            const ini = chave(m.nome).slice(0, 8);
            const cand = livres.filter((p) => {
                if (p.usado || centavos(p.m.valor) !== centavos(m.valor)) return false;
                const d = dias(m.data, p.m.data);
                return janela === 0 ? d === 0 : d >= 0 && d <= janela;
            });
            if (!cand.length) return;
            const mesmoNome = cand.filter((p) => chave(p.m.nome).includes(ini) || ini.includes(chave(p.m.nome).slice(0, 8)));
            if (janela > 0 && !mesmoNome.length) return;
            const escolhido = (mesmoNome.length ? mesmoNome : cand).sort((x, y) => dias(m.data, x.m.data) - dias(m.data, y.m.data))[0];
            escolhido.usado = true;
            par[i] = escolhido;
        });
    }
    let casados = 0;
    const movimentos = completo.movimentos.map((m, i) => {
        const p = par[i];
        if (!p) return m;
        casados++;
        return { ...m, hora: p.m.hora, nome: p.m.nome || m.nome, descricao: p.m.descricao };
    });
    return { ...completo, movimentos, pixCasados: casados, pixSobrando: livres.filter((p) => !p.usado).length };
}
