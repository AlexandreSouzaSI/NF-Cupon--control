import PDFDocument from 'pdfkit';

// Relatório de Contas a Pagar do dia — contas com vencimento hoje +
// vencidas que foram manualmente incluídas nos pagamentos de hoje
// (Bill.queuedForPaymentAt). Simples de propósito: fornecedor, descrição,
// vencimento, situação e valor, com total no fim — pensado pra imprimir
// ou levar pra conferência de caixa, não é um documento fiscal.
export type TodayReportBill = {
    id: string;
    description: string;
    value: number;
    dueDate: Date;
    status: string;
    supplierName: string | null;
    storeName: string;
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

export function buildTodayReportPdf(
    bills: TodayReportBill[],
    meta: { storeName: string; today: Date },
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 40 });
            const chunks: Buffer[] = [];

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            doc.fontSize(16).font('Helvetica-Bold').text(
                'Contas a Pagar — Relatório do dia',
            );
            doc.fontSize(9).fillColor('#666').font('Helvetica').text(
                `${meta.storeName} — ${fmtDate(meta.today)}`,
            );
            doc.fillColor('#000');
            doc.moveDown(1);

            if (bills.length === 0) {
                doc.fontSize(11).text(
                    'Nenhuma conta com vencimento hoje ou marcada pra pagamento hoje.',
                );
                doc.end();
                return;
            }

            const colX = {
                fornecedor: 40,
                descricao: 180,
                vencimento: 340,
                situacao: 410,
                valor: 480,
            };

            const tableTop = doc.y;

            doc.fontSize(8).font('Helvetica-Bold');
            doc.text('Fornecedor', colX.fornecedor, tableTop, { width: 135 });
            doc.text('Descrição', colX.descricao, tableTop, { width: 155 });
            doc.text('Vencimento', colX.vencimento, tableTop, { width: 65 });
            doc.text('Situação', colX.situacao, tableTop, { width: 65 });
            doc.text('Valor', colX.valor, tableTop, {
                width: 75,
                align: 'right',
            });
            doc.font('Helvetica');

            let y = tableTop + 14;
            doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor('#ccc').stroke();

            let total = 0;

            for (const bill of bills) {
                if (y > 760) {
                    doc.addPage();
                    y = 40;
                }

                total += bill.value;

                const situacao =
                    bill.status === 'OVERDUE' ? 'Vencida' : 'Hoje';

                doc.fontSize(8).fillColor(
                    situacao === 'Vencida' ? '#dc2626' : '#000',
                );

                doc.text(
                    bill.supplierName || '—',
                    colX.fornecedor,
                    y,
                    { width: 135 },
                );
                doc.text(bill.description, colX.descricao, y, {
                    width: 155,
                });
                doc.text(fmtDate(bill.dueDate), colX.vencimento, y, {
                    width: 65,
                });
                doc.text(situacao, colX.situacao, y, { width: 65 });
                doc.text(fmtCurrency(bill.value), colX.valor, y, {
                    width: 75,
                    align: 'right',
                });

                doc.fillColor('#000');

                y += 18;
            }

            doc.moveTo(40, y).lineTo(555, y).strokeColor('#ccc').stroke();
            y += 10;

            doc.fontSize(12).font('Helvetica-Bold').text(
                `Total do dia: ${fmtCurrency(total)}`,
                colX.descricao,
                y,
                { width: 275, align: 'right' },
            );

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}
