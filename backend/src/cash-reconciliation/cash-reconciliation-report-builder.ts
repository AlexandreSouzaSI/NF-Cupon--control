import PDFDocument from 'pdfkit';

// Relatório de Conciliação de Caixa do dia — comparação lado a lado do
// que o sistema registrou (lançado manualmente) com o que caiu no banco,
// por forma de pagamento, com a diferença destacada. Pensado pra
// impressão/apoio à tomada de decisão, não é documento fiscal (mesmo
// espírito do bills-report-builder.ts).
export type CashReconciliationReportData = {
    storeName: string;
    date: Date;
    systemCash: number;
    systemDebit: number;
    systemCredit: number;
    bankCash: number;
    bankDebit: number;
    bankCredit: number;
    otherSystem: number;
    otherBank: number;
    otherDescription: string | null;
    withdrawalAmount: number;
    withdrawalReason: string | null;
    notes: string | null;
    launchedByName: string;
};

function fmtCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function fmtDate(value: Date): string {
    return value.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function buildCashReconciliationPdf(
    data: CashReconciliationReportData,
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 40 });
            const chunks: Buffer[] = [];

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            doc.fontSize(16).font('Helvetica-Bold').text(
                'Conciliação de Caixa',
            );
            doc.fontSize(9).fillColor('#666').font('Helvetica').text(
                `${data.storeName} — ${fmtDate(data.date)}`,
            );
            doc.fillColor('#000');
            doc.moveDown(1.2);

            const hasOther =
                Math.abs(data.otherSystem) > 0.001 ||
                Math.abs(data.otherBank) > 0.001 ||
                !!data.otherDescription;
            const hasWithdrawal = Math.abs(data.withdrawalAmount) > 0.001;

            const totalSystem =
                data.systemCash +
                data.systemDebit +
                data.systemCredit +
                data.otherSystem;
            const totalBank =
                data.bankCash + data.bankDebit + data.bankCredit +
                data.otherBank;

            // Diferença bruta (banco - sistema) e diferença ajustada, que
            // soma de volta o vale/retirada — dinheiro que saiu do caixa
            // antes de virar depósito não é "sumiço", então ele explica
            // parte (ou tudo) de um banco menor que o sistema.
            const rawDiff = totalBank - totalSystem;
            const adjustedDiff = rawDiff + data.withdrawalAmount;

            const colX = { label: 40, sistema: 300, banco: 400, diff: 480 };
            const tableTop = doc.y;

            doc.fontSize(8).font('Helvetica-Bold');
            doc.text('Forma de pagamento', colX.label, tableTop, {
                width: 250,
            });
            doc.text('Sistema', colX.sistema, tableTop, {
                width: 90,
                align: 'right',
            });
            doc.text('Banco', colX.banco, tableTop, {
                width: 70,
                align: 'right',
            });
            doc.text('Diferença', colX.diff, tableTop, {
                width: 75,
                align: 'right',
            });
            doc.font('Helvetica');

            let y = tableTop + 16;
            doc.moveTo(40, y - 3).lineTo(555, y - 3).strokeColor('#ccc')
                .stroke();

            const rows: Array<[string, number, number]> = [
                ['Dinheiro', data.systemCash, data.bankCash],
                ['Débito', data.systemDebit, data.bankDebit],
                ['Crédito', data.systemCredit, data.bankCredit],
            ];
            if (hasOther) {
                rows.push([
                    data.otherDescription
                        ? `Outros (${data.otherDescription})`
                        : 'Outros',
                    data.otherSystem,
                    data.otherBank,
                ]);
            }

            for (const [label, system, bank] of rows) {
                const diff = bank - system;
                doc.fontSize(9).fillColor('#000');
                doc.text(label, colX.label, y, { width: 250 });
                doc.text(fmtCurrency(system), colX.sistema, y, {
                    width: 90,
                    align: 'right',
                });
                doc.text(fmtCurrency(bank), colX.banco, y, {
                    width: 70,
                    align: 'right',
                });
                doc.fillColor(
                    Math.abs(diff) < 0.01
                        ? '#166534'
                        : diff < 0
                            ? '#dc2626'
                            : '#b45309',
                );
                doc.text(
                    `${diff < 0 ? '-' : diff > 0 ? '+' : ''}${fmtCurrency(Math.abs(diff))}`,
                    colX.diff,
                    y,
                    { width: 75, align: 'right' },
                );
                doc.fillColor('#000');
                y += 18;
            }

            doc.moveTo(40, y).lineTo(555, y).strokeColor('#ccc').stroke();
            y += 10;

            doc.fontSize(11).font('Helvetica-Bold');
            doc.text('Total do dia', colX.label, y, { width: 250 });
            doc.text(fmtCurrency(totalSystem), colX.sistema, y, {
                width: 90,
                align: 'right',
            });
            doc.text(fmtCurrency(totalBank), colX.banco, y, {
                width: 70,
                align: 'right',
            });
            doc.fillColor(
                Math.abs(rawDiff) < 0.01
                    ? '#166534'
                    : rawDiff < 0
                        ? '#dc2626'
                        : '#b45309',
            );
            doc.text(
                `${rawDiff < 0 ? '-' : rawDiff > 0 ? '+' : ''}${fmtCurrency(Math.abs(rawDiff))}`,
                colX.diff,
                y,
                { width: 75, align: 'right' },
            );
            doc.fillColor('#000');
            y += 26;

            if (hasWithdrawal) {
                doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text(
                    'Vale / retirada do caixa',
                    colX.label,
                    y,
                );
                doc.font('Helvetica').text(
                    fmtCurrency(data.withdrawalAmount),
                    colX.sistema,
                    y,
                    { width: 90, align: 'right' },
                );
                y = doc.y + 4;
                if (data.withdrawalReason) {
                    doc.fontSize(8).fillColor('#666').text(
                        `Motivo: ${data.withdrawalReason}`,
                        colX.label,
                        y,
                        { width: 400 },
                    );
                    y = doc.y;
                }
                doc.fillColor('#000');
                y += 14;
            }

            // Conclusão — texto direto, com o valor exato em falta ou a
            // mais, já considerando o vale/retirada do dia.
            const absAdjusted = Math.abs(adjustedDiff);
            let conclusion: string;
            let conclusionColor: string;

            if (absAdjusted < 0.01) {
                conclusionColor = '#166534';
                conclusion = hasWithdrawal
                    ? `Bateu certinho: o valor que faltou no banco (${fmtCurrency(Math.abs(rawDiff))}) corresponde exatamente ao vale/retirada do dia. Nenhuma diferença sem explicação.`
                    : 'Bateu certinho: o valor recebido pelo sistema corresponde ao que caiu no banco. Nenhuma ação necessária.';
            } else if (adjustedDiff < 0) {
                conclusionColor = '#dc2626';
                conclusion = hasWithdrawal
                    ? `Faltou cair no banco ${fmtCurrency(absAdjusted)}, mesmo já descontando o vale/retirada de ${fmtCurrency(data.withdrawalAmount)}. Verificar o motivo da diferença antes de fechar o caixa do dia.`
                    : `Faltou cair no banco ${fmtCurrency(absAdjusted)} em relação ao que o sistema registrou. Verificar o motivo da diferença antes de fechar o caixa do dia.`;
            } else {
                conclusionColor = '#b45309';
                conclusion = `Sobrou ${fmtCurrency(absAdjusted)} no banco em relação ao que o sistema registrou${hasWithdrawal ? ', já considerando o vale/retirada do dia' : ''}. Verificar se algum recebimento não foi lançado no sistema.`;
            }

            doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text(
                'Conclusão',
                40,
                y,
            );
            y = doc.y + 4;
            doc.fontSize(10).font('Helvetica').fillColor(conclusionColor)
                .text(conclusion, 40, y, { width: 515 });
            doc.fillColor('#000');
            y = doc.y + 16;

            if (data.notes) {
                doc.fontSize(9).font('Helvetica-Bold').text(
                    'Observações',
                    40,
                    y,
                );
                y = doc.y + 4;
                doc.font('Helvetica').text(data.notes, 40, y, { width: 515 });
                y = doc.y + 16;
            }

            doc.fontSize(8).fillColor('#999').text(
                `Lançado por ${data.launchedByName}`,
                40,
                y,
            );

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}
