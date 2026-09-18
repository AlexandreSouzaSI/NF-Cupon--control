import PDFDocument from 'pdfkit';

import type { NfeView } from '../stores/sefaz-nfe-client';
import type { NfseView } from '../stores/sefaz-nfse-client';

// ---------------------------------------------------------------------
// Gerador de "DANFE simplificado" — NÃO é o DANFE oficial (layout exato
// definido pelo Manual de Orientação do Contribuinte, com código de
// barras Code-128 da chave de acesso, posição fixa de cada campo etc.).
// Reproduzir o layout oficial byte a byte é um projeto à parte; aqui a
// ideia é dar pro usuário um PDF legível e útil pra conferência/arquivo
// interno, com todos os dados que o sistema já tem (emitente/destinatário,
// itens, totais, chave de acesso), sem depender de nenhuma biblioteca
// pesada (puppeteer etc.) — só pdfkit, que já é puro JS.
//
// Pra NF-e de terceiros (Entrada/Saída) o fornecedor/comprador já manda o
// DANFE oficial junto com a compra — isso aqui é só um substituto pra
// quando esse PDF não está à mão. Pra NF-e emitidas pelo próprio GestIA
// (Perda, Devolução) é a única "visão em PDF" disponível hoje.
// "source" não é usado aqui dentro (só nf/resumo) — deixado como string
// solta de propósito pra aceitar o retorno de qualquer um dos vários
// métodos viewXxx() dos outros services sem precisar forçar o literal
// exato que cada um infere ('xml' | 'resumo' | 'arquivo' | 'nenhum').
export type DanfeViewResponse = {
    source: string;
    resumo: Record<string, any> | null;
    nf: NfeView | NfseView | null;
};

function isNfeView(nf: NfeView | NfseView): nf is NfeView {
    return 'emitente' in nf;
}

function fmtCurrency(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function fmtDate(value?: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('pt-BR');
}

function fmtPercent(value?: number | null): string {
    if (value === null || value === undefined) return '—';
    return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

// Chave de acesso em grupos de 4 dígitos, igual aparece embaixo do
// código de barras no DANFE oficial — mais fácil de digitar manualmente
// se precisar.
function formatChave(chave?: string): string {
    if (!chave) return '—';
    return chave.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function drawSectionTitle(doc: PDFKit.PDFDocument, text: string) {
    doc.moveDown(0.6);
    doc.fontSize(9).fillColor('#666').font('Helvetica-Bold').text(text.toUpperCase());
    doc.fillColor('#000').font('Helvetica');
}

function drawField(doc: PDFKit.PDFDocument, label: string, value?: string | null) {
    if (!value) return;
    doc.fontSize(7).fillColor('#666').text(label, { continued: false });
    doc.fontSize(10).fillColor('#000').text(value);
    doc.moveDown(0.3);
}

export function buildDanfePdf(title: string, data: DanfeViewResponse): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 40 });
            const chunks: Buffer[] = [];

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Cabeçalho
            doc.fontSize(16).font('Helvetica-Bold').text(title);
            doc.fontSize(8).fillColor('#999').font('Helvetica').text(
                'DANFE SIMPLIFICADO — documento gerado pelo GestIA pra conferência interna. ' +
                'Não substitui o DANFE oficial (sem código de barras, layout não certificado).',
            );
            doc.fillColor('#000');
            doc.moveDown(0.8);

            if (!data.nf && !data.resumo) {
                doc.fontSize(11).text('Nenhum dado disponível pra essa NF.');
                doc.end();
                return;
            }

            if (data.nf && isNfeView(data.nf)) {
                drawNfeContent(doc, data.nf);
            } else if (data.nf) {
                drawNfseContent(doc, data.nf as NfseView);
            } else if (data.resumo) {
                drawResumoContent(doc, data.resumo);
            }

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

function drawResumoContent(doc: PDFKit.PDFDocument, resumo: Record<string, any>) {
    doc.fontSize(9).fillColor('#b45309').text(
        'Só o resumo dessa NF estava disponível (sem XML completo) — dados limitados.',
    );
    doc.fillColor('#000');

    drawSectionTitle(doc, 'Dados gerais');
    drawField(doc, 'Empresa', resumo.issuerName || resumo.recipientName);
    drawField(doc, 'CNPJ/CPF', resumo.issuerCnpj || resumo.issuerDoc || resumo.recipientCnpj);
    drawField(doc, 'Valor', fmtCurrency(resumo.value));
    drawField(doc, 'Data de emissão', fmtDate(resumo.issueDate));
    drawField(doc, 'Situação', resumo.situacao);
    drawField(doc, 'Chave de acesso', formatChave(resumo.chaveAcesso));
}

function drawNfeContent(doc: PDFKit.PDFDocument, nf: NfeView) {
    if (!nf.detalhamentoCompleto) {
        doc.fontSize(9).fillColor('#b45309').text(
            'Só o resumo dessa NF estava disponível — sem itens detalhados.',
        );
        doc.fillColor('#000');
    }

    drawSectionTitle(doc, 'Identificação');
    const colWidth = 250;
    const startY = doc.y;

    doc.fontSize(7).fillColor('#666').text('Chave de acesso', 40, startY);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text(formatChave(nf.chaveAcesso), 40, startY + 11, { width: 500 });
    doc.font('Helvetica');
    doc.moveDown(1.2);

    doc.fontSize(7).fillColor('#666').text(`Data de emissão: `, { continued: true });
    doc.fillColor('#000').text(fmtDate(nf.issueDate));
    if (nf.naturezaOperacao) {
        doc.fontSize(7).fillColor('#666').text(`Natureza da operação: `, { continued: true });
        doc.fillColor('#000').text(nf.naturezaOperacao);
    }
    if (nf.situacao) {
        doc.fontSize(7).fillColor('#666').text(`Situação: `, { continued: true });
        doc.fillColor('#000').text(nf.situacao);
    }

    drawSectionTitle(doc, 'Emitente');
    drawField(doc, 'Nome', nf.emitente.nome);
    drawField(doc, 'CNPJ', nf.emitente.cnpj);
    drawField(doc, 'Endereço', formatAddress(nf.emitente.endereco));

    drawSectionTitle(doc, 'Destinatário');
    drawField(doc, 'Nome', nf.destinatario.nome);
    drawField(doc, 'CNPJ/CPF', nf.destinatario.cnpj || nf.destinatario.cpf);
    drawField(doc, 'Endereço', formatAddress(nf.destinatario.endereco));

    if (nf.itens.length > 0) {
        drawSectionTitle(doc, 'Itens');

        const tableTop = doc.y + 4;
        const colX = { desc: 40, qtd: 330, vUn: 400, vTot: 470 };

        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Descrição', colX.desc, tableTop, { width: 280 });
        doc.text('Qtd', colX.qtd, tableTop, { width: 60, align: 'right' });
        doc.text('Vl. unit.', colX.vUn, tableTop, { width: 60, align: 'right' });
        doc.text('Vl. total', colX.vTot, tableTop, { width: 80, align: 'right' });
        doc.font('Helvetica');

        let y = tableTop + 14;
        doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor('#ccc').stroke();

        for (const item of nf.itens) {
            if (y > 760) {
                doc.addPage();
                y = 40;
            }

            const desc = `${item.descricao || 'Item sem descrição'}${item.unidade ? ` (${item.unidade})` : ''}`;
            doc.fontSize(8);
            doc.text(desc, colX.desc, y, { width: 280 });
            doc.text(String(item.quantidade ?? '—'), colX.qtd, y, { width: 60, align: 'right' });
            doc.text(fmtCurrency(item.valorUnitario), colX.vUn, y, { width: 60, align: 'right' });
            doc.text(fmtCurrency(item.valorTotal), colX.vTot, y, { width: 80, align: 'right' });

            y += 16;
        }

        doc.y = y;
    }

    drawSectionTitle(doc, 'Impostos');
    doc.fontSize(9);
    doc.text(
        `ICMS: ${fmtCurrency(nf.totais.valorICMS)}    IPI: ${fmtCurrency(nf.totais.valorIPI)}    ` +
        `PIS: ${fmtCurrency(nf.totais.valorPIS)}    COFINS: ${fmtCurrency(nf.totais.valorCOFINS)}`,
    );

    drawSectionTitle(doc, 'Valores');
    doc.fontSize(9).text(
        `Produtos: ${fmtCurrency(nf.totais.valorProdutos)}    Desconto: ${fmtCurrency(nf.totais.valorDesconto)}    ` +
        `Frete: ${fmtCurrency(nf.totais.valorFrete)}`,
    );
    doc.moveDown(0.4);
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#c2410c').text(
        `Total da NF: ${fmtCurrency(nf.totais.valorTotal)}`,
    );
    doc.fillColor('#000').font('Helvetica');
}

function drawNfseContent(doc: PDFKit.PDFDocument, nf: NfseView) {
    if (!nf.detalhamentoCompleto) {
        doc.fontSize(9).fillColor('#b45309').text(
            'Detalhamento parcial — alguns campos podem não ter sido encontrados no XML.',
        );
        doc.fillColor('#000');
    }

    drawSectionTitle(doc, 'Identificação');
    drawField(doc, 'Número da NF', nf.numeroNf);
    drawField(doc, 'Data de emissão', fmtDate(nf.issueDate));

    drawSectionTitle(doc, 'Prestador');
    drawField(doc, 'Nome', nf.prestador.nome);
    drawField(doc, 'CNPJ/CPF', nf.prestador.cnpj || nf.prestador.cpf);
    drawField(doc, 'Inscrição municipal', nf.prestador.inscricaoMunicipal);
    drawField(doc, 'Endereço', formatAddress(nf.prestador.endereco));

    drawSectionTitle(doc, 'Tomador');
    drawField(doc, 'Nome', nf.tomador.nome);
    drawField(doc, 'CNPJ/CPF', nf.tomador.cnpj || nf.tomador.cpf);
    drawField(doc, 'Endereço', formatAddress(nf.tomador.endereco));

    if (nf.servico.descricao) {
        drawSectionTitle(doc, 'Descrição do serviço');
        doc.fontSize(9).text(nf.servico.descricao, { width: 500 });
    }

    drawSectionTitle(doc, 'Valores');
    doc.fontSize(9).text(
        `Base de cálculo: ${fmtCurrency(nf.valores.baseCalculo)}    Alíquota ISS: ${fmtPercent(nf.valores.aliquota)}    ` +
        `ISS: ${fmtCurrency(nf.valores.valorISS)}    ISS retido: ${nf.valores.issRetido === undefined ? '—' : nf.valores.issRetido ? 'Sim' : 'Não'}`,
    );
    doc.moveDown(0.4);
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#c2410c').text(
        `Valor do serviço: ${fmtCurrency(nf.valores.valorServico)}`,
    );
    doc.fillColor('#000').font('Helvetica');
}

function formatAddress(address?: {
    logradouro?: string;
    numero?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
}): string | undefined {
    if (!address) return undefined;
    const line1 = [address.logradouro, address.numero].filter(Boolean).join(', ');
    const line2 = [address.bairro, address.municipio, address.uf].filter(Boolean).join(' - ');
    const parts = [line1, line2, address.cep ? `CEP ${address.cep}` : null].filter(Boolean);
    return parts.length > 0 ? parts.join(' | ') : undefined;
}
