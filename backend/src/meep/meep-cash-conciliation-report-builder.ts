import PDFDocument from 'pdfkit';

// Relatório Diário/Semanal da Conciliação de Caixa (Vendas Meep) — uma
// linha por dia comercial (Credito/Debito/PIX/Dinheiro/Total Venda +
// Freelancer/Descontos/Outros/Vale/Observação) e uma linha de total do
// período, igual a planilha que o usuário usava antes de ter essa tela.
// Mesmo "um dia só" (relatório diário) ou vários dias (semanal) passam
// pelo mesmo builder — a diferença é só quantas linhas tem.
export type CashConciliationReportRow = {
    dia: string;
    credito: number;
    debito: number;
    pix: number;
    dinheiro: number;
    totalVenda: number;
    freelancer: number;
    descontos: number;
    outros: number;
    vale: number;
    observacao: string | null;
    // Conciliação Sistema x Banco, que até então vivia numa tela manual
    // separada, agora é parte da mesma grade Meep por dia (ver
    // CashConciliationTab no frontend: linhas Editável/Banco/Diferença).
    bancoTotal: number;
    diferenca: number;
    // Diferença (Banco - Editável) por forma de pagamento — usada só no
    // resumo textual abaixo da tabela, pra dizer especificamente que forma
    // de pagamento ficou faltando ou sobrando, não só o total do dia.
    diffCredito: number;
    diffDebito: number;
    diffPix: number;
    diffDinheiro: number;
};

export type CashConciliationReportData = {
    storeName: string;
    rows: CashConciliationReportRow[];
};

function fmtCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function fmtDate(value: string) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
}

export function buildCashConciliationPdf(
    data: CashConciliationReportData,
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                layout: 'landscape',
                margin: 30,
            });
            const chunks: Buffer[] = [];

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const rows = data.rows;
            const periodo =
                rows.length === 0
                    ? ''
                    : rows.length === 1
                        ? fmtDate(rows[0].dia)
                        : `${fmtDate(rows[rows.length - 1].dia)} a ${fmtDate(rows[0].dia)}`;

            doc.fontSize(15).font('Helvetica-Bold').text(
                `Conciliação de Caixa${rows.length === 1 ? ' — Diário' : ' — Semanal'}`,
            );
            doc.fontSize(9).fillColor('#666').font('Helvetica').text(
                `${data.storeName} — ${periodo}`,
            );
            doc.fillColor('#000');
            doc.moveDown(1);

            // Banco/Diferença entram sempre — Diário ou Semanal — porque é
            // justamente essa coluna que diz se bateu certinho ou não; sem
            // ela o relatório de 1 dia só não informa se houve diferença
            // (reclamação real: o PDF Diário escondia isso achando que o
            // usuário já tinha visto na tela, mas o relatório costuma ser
            // olhado depois, sem a tela aberta).
            const isSemanal = rows.length > 1;

            const cols = [
                { key: 'dia', label: 'Data', width: 60, align: 'left' as const },
                { key: 'credito', label: 'Credito', width: 65, align: 'right' as const },
                { key: 'debito', label: 'Debito', width: 65, align: 'right' as const },
                { key: 'pix', label: 'PIX', width: 65, align: 'right' as const },
                { key: 'dinheiro', label: 'Dinheiro', width: 65, align: 'right' as const },
                { key: 'totalVenda', label: 'Total Venda', width: 70, align: 'right' as const },
                { key: 'bancoTotal', label: 'Banco', width: 65, align: 'right' as const },
                { key: 'diferenca', label: 'Diferença', width: 65, align: 'right' as const },
                { key: 'freelancer', label: 'Freelancer', width: 60, align: 'right' as const },
                { key: 'descontos', label: 'Descontos', width: 60, align: 'right' as const },
                { key: 'outros', label: 'Outros', width: 60, align: 'right' as const },
                { key: 'vale', label: 'Vale', width: 60, align: 'right' as const },
                { key: 'observacao', label: 'Observação', width: 110, align: 'left' as const },
            ];

            let x = 30;
            const colX: Record<string, number> = {};
            const colWidth: Record<string, number> = {};
            for (const col of cols) {
                colX[col.key] = x;
                colWidth[col.key] = col.width;
                x += col.width;
            }

            const tableTop = doc.y;
            doc.fontSize(8).font('Helvetica-Bold');
            for (const col of cols) {
                doc.text(col.label, colX[col.key], tableTop, {
                    width: col.width,
                    align: col.align,
                });
            }
            doc.font('Helvetica');

            let y = tableTop + 16;
            doc.moveTo(30, y - 3).lineTo(x, y - 3).strokeColor('#ccc').stroke();

            const totals = {
                credito: 0,
                debito: 0,
                pix: 0,
                dinheiro: 0,
                totalVenda: 0,
                freelancer: 0,
                descontos: 0,
                outros: 0,
                vale: 0,
                bancoTotal: 0,
                diferenca: 0,
            };

            for (const row of rows) {
                totals.credito += row.credito;
                totals.debito += row.debito;
                totals.pix += row.pix;
                totals.dinheiro += row.dinheiro;
                totals.totalVenda += row.totalVenda;
                totals.freelancer += row.freelancer;
                totals.descontos += row.descontos;
                totals.outros += row.outros;
                totals.vale += row.vale;
                totals.bancoTotal += row.bancoTotal;
                totals.diferenca += row.diferenca;

                doc.fontSize(8).fillColor('#000');
                doc.text(fmtDate(row.dia), colX.dia, y, { width: colWidth.dia });
                doc.text(fmtCurrency(row.credito), colX.credito, y, { width: colWidth.credito, align: 'right' });
                doc.text(fmtCurrency(row.debito), colX.debito, y, { width: colWidth.debito, align: 'right' });
                doc.text(fmtCurrency(row.pix), colX.pix, y, { width: colWidth.pix, align: 'right' });
                doc.text(fmtCurrency(row.dinheiro), colX.dinheiro, y, { width: colWidth.dinheiro, align: 'right' });
                doc.font('Helvetica-Bold').text(fmtCurrency(row.totalVenda), colX.totalVenda, y, { width: colWidth.totalVenda, align: 'right' });
                doc.font('Helvetica');
                doc.text(fmtCurrency(row.bancoTotal), colX.bancoTotal, y, { width: colWidth.bancoTotal, align: 'right' });
                const diffOk = Math.abs(row.diferenca) < 0.01;
                doc.fillColor(diffOk ? '#000' : row.diferenca < 0 ? '#c0392b' : '#b7791f');
                doc.text(
                    `${row.diferenca < 0 ? '-' : row.diferenca > 0 ? '+' : ''}${fmtCurrency(Math.abs(row.diferenca))}`,
                    colX.diferenca,
                    y,
                    { width: colWidth.diferenca, align: 'right' },
                );
                doc.fillColor('#000');
                doc.text(fmtCurrency(row.freelancer), colX.freelancer, y, { width: colWidth.freelancer, align: 'right' });
                doc.text(fmtCurrency(row.descontos), colX.descontos, y, { width: colWidth.descontos, align: 'right' });
                doc.text(fmtCurrency(row.outros), colX.outros, y, { width: colWidth.outros, align: 'right' });
                doc.text(fmtCurrency(row.vale), colX.vale, y, { width: colWidth.vale, align: 'right' });
                doc.fontSize(7).fillColor('#666').text(row.observacao || '', colX.observacao, y, { width: colWidth.observacao });
                doc.fillColor('#000');

                y += 16;
                if (y > 540) {
                    doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
                    y = 40;
                }
            }

            doc.moveTo(30, y).lineTo(x, y).strokeColor('#ccc').stroke();
            y += 8;

            doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
            doc.text('Total do período', colX.dia, y, { width: colWidth.dia });
            doc.text(fmtCurrency(totals.credito), colX.credito, y, { width: colWidth.credito, align: 'right' });
            doc.text(fmtCurrency(totals.debito), colX.debito, y, { width: colWidth.debito, align: 'right' });
            doc.text(fmtCurrency(totals.pix), colX.pix, y, { width: colWidth.pix, align: 'right' });
            doc.text(fmtCurrency(totals.dinheiro), colX.dinheiro, y, { width: colWidth.dinheiro, align: 'right' });
            doc.text(fmtCurrency(totals.totalVenda), colX.totalVenda, y, { width: colWidth.totalVenda, align: 'right' });
            doc.text(fmtCurrency(totals.bancoTotal), colX.bancoTotal, y, { width: colWidth.bancoTotal, align: 'right' });
            doc.text(
                `${totals.diferenca < 0 ? '-' : totals.diferenca > 0 ? '+' : ''}${fmtCurrency(Math.abs(totals.diferenca))}`,
                colX.diferenca,
                y,
                { width: colWidth.diferenca, align: 'right' },
            );
            doc.text(fmtCurrency(totals.freelancer), colX.freelancer, y, { width: colWidth.freelancer, align: 'right' });
            doc.text(fmtCurrency(totals.descontos), colX.descontos, y, { width: colWidth.descontos, align: 'right' });
            doc.text(fmtCurrency(totals.outros), colX.outros, y, { width: colWidth.outros, align: 'right' });
            doc.text(fmtCurrency(totals.vale), colX.vale, y, { width: colWidth.vale, align: 'right' });

            // Resumo das diferenças — texto abaixo da tabela dizendo, por
            // dia, quanto faltou/sobrou no banco e EM QUAL forma de
            // pagamento (não só o total). A tabela já mostra o número, mas
            // sozinho ele não diz se o furo foi no Débito, no PIX etc — é
            // exatamente essa falta de detalhe que o usuário pediu pra
            // preencher aqui.
            y += 26;
            if (y > 520) {
                doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
                y = 40;
            }

            const diasComDiferenca = rows.filter((row) => Math.abs(row.diferenca) >= 0.01);

            doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('Resumo das diferenças', 30, y);
            y += 16;

            if (diasComDiferenca.length === 0) {
                doc.fontSize(8).font('Helvetica').fillColor('#000').text(
                    rows.length === 0
                        ? 'Nenhum dia no período.'
                        : 'Bateu certinho em todos os dias do período — nenhuma diferença entre Banco e Sistema.',
                    30,
                    y,
                    { width: x - 30 },
                );
                y += 14;
            } else {
                for (const row of diasComDiferenca) {
                    const faltouOuSobrou = row.diferenca < 0 ? 'Faltou cair no banco' : 'Sobrou no banco';

                    const porCategoria: string[] = [];
                    const categorias: { label: string; valor: number }[] = [
                        { label: 'Crédito', valor: row.diffCredito },
                        { label: 'Débito', valor: row.diffDebito },
                        { label: 'PIX', valor: row.diffPix },
                        { label: 'Dinheiro', valor: row.diffDinheiro },
                    ];
                    for (const cat of categorias) {
                        if (Math.abs(cat.valor) < 0.01) continue;
                        const sinalFaltaOuSobra = cat.valor < 0 ? 'faltou' : 'sobrou';
                        porCategoria.push(`${cat.label} ${sinalFaltaOuSobra} ${fmtCurrency(Math.abs(cat.valor))}`);
                    }

                    const linha =
                        `${fmtDate(row.dia)}: ${faltouOuSobrou} ${fmtCurrency(Math.abs(row.diferenca))}` +
                        (porCategoria.length > 0 ? ` — ${porCategoria.join(', ')}.` : '.');

                    doc.fontSize(8).font('Helvetica').fillColor(row.diferenca < 0 ? '#c0392b' : '#b7791f').text(
                        linha,
                        30,
                        y,
                        { width: x - 30 },
                    );
                    y += 13;

                    if (y > 540) {
                        doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
                        y = 40;
                    }
                }
            }
            doc.fillColor('#000');

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}
