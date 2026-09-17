'use client';

type DonutItem = {
    label: string;
    value: number;
    cor: string;
};

export function DonutChart({
    itens,
    tamanho = 200,
    espessura = 30,
    centro,
}: {
    itens: DonutItem[];
    tamanho?: number;
    espessura?: number;
    centro?: { titulo: string; valor: string };
}) {
    const total = itens.reduce((acc, item) => acc + item.value, 0);

    if (total <= 0) {
        return (
            <div
                className="flex items-center justify-center rounded-full border-4 border-dashed border-zinc-200 text-center text-xs text-zinc-400 dark:border-zinc-700"
                style={{ width: tamanho, height: tamanho }}
            >
                Sem dados
            </div>
        );
    }

    let acumulado = 0;
    const stops = itens
        .map((item) => {
            const inicio = (acumulado / total) * 360;
            acumulado += item.value;
            const fim = (acumulado / total) * 360;
            return `${item.cor} ${inicio}deg ${fim}deg`;
        })
        .join(', ');

    const miolo = tamanho - espessura * 2;

    return (
        <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
            <div
                className="h-full w-full rounded-full shadow-inner transition-all duration-700"
                style={{ background: `conic-gradient(${stops})` }}
            />
            <div
                className="absolute rounded-full bg-white dark:bg-zinc-900"
                style={{
                    width: miolo,
                    height: miolo,
                    top: espessura,
                    left: espessura,
                }}
            />
            {centro && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[11px] text-zinc-500">{centro.titulo}</span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-white">
                        {centro.valor}
                    </span>
                </div>
            )}
        </div>
    );
}
