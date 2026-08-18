// Parser simples de extrato OFX (formato padrão dos bancos pra exportar
// movimentações). OFX 1.x é SGML (tags sem fechamento em cada linha) e OFX
// 2.x é XML de verdade — como só precisamos ler os valores de cada
// <STMTTRN>, uma extração via regex cobre os dois formatos sem precisar de
// biblioteca externa nem de um parser SGML completo.
export type OfxTransaction = {
    fitId: string;
    type: string;
    postedAt: string; // YYYY-MM-DD
    amount: number;
    description: string;
};

function extractTag(block: string, tag: string): string {
    const match = block.match(new RegExp(`<${tag}>([^\r\n<]*)`, 'i'));
    return match ? match[1].trim() : '';
}

export function parseOfx(content: string): OfxTransaction[] {
    const blocks = content.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) || [];

    const transactions: OfxTransaction[] = [];

    blocks.forEach((block, index) => {
        const dtPosted = extractTag(block, 'DTPOSTED');
        const amountRaw = extractTag(block, 'TRNAMT');

        if (!dtPosted || !amountRaw) {
            return;
        }

        const amount = Number(amountRaw.replace(',', '.'));

        if (Number.isNaN(amount)) {
            return;
        }

        const year = dtPosted.slice(0, 4);
        const month = dtPosted.slice(4, 6);
        const day = dtPosted.slice(6, 8);

        const description =
            extractTag(block, 'MEMO') ||
            extractTag(block, 'NAME') ||
            'Sem descrição';

        const fitId = extractTag(block, 'FITID') || `linha-${index + 1}`;
        const type = extractTag(block, 'TRNTYPE') || 'OUTRO';

        transactions.push({
            fitId,
            type,
            postedAt: `${year}-${month}-${day}`,
            amount,
            description,
        });
    });

    return transactions;
}
