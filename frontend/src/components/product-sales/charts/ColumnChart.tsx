'use client';

type ColumnItem = {
    label: string;
    value: number;
};

export function ColumnChart({
    itens,
    corDe,
    corPara,
    formatarValor,
    ordem = 'desc',
}: {
    itens: ColumnItem[];
    corDe: string;
    corPara: string;
    formatarValor: (valor: number) => string;
    ordem?: 'asc' | 'desc';
}) {
    if (itens.length === 0) {
        return (
            <div className="flex h-56 items-center justify-center text-sm text-zinc-400">
                Sem dados suficientes.
            </div>
        );
    }

    const max = Math.max(...itens.map((i) => i.value), 1);

    return (
        <div className="flex h-64 items-end gap-2 overflow-x-auto pb-1">
            {itens.map((item, index) => {
                const altura = Math.max((item.value / max) * 100, 3);
                const posicao = ordem === 'desc' ? index + 1 : itens.length - index;

                return (
                    <div
                        key={`${item.label}-${index}`}
                        className="group flex h-full min-w-[46px] flex-1 flex-col items-center justify-end"
                        title={`${posicao}º · ${item.label}: ${formatarValor(item.value)}`}
                    >
                        <span className="mb-1 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                            {formatarValor(item.value)}
                        </span>

                        <div
                            className="w-full max-w-[30px] rounded-t-lg shadow-sm transition-all duration-500 ease-out group-hover:opacity-80"
                            style={{
                                height: `${altura}%`,
                                background: `linear-gradient(180deg, ${corDe}, ${corPara})`,
                            }}
                        />

                        <span className="mt-2 line-clamp-2 w-full text-center text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
                            {item.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
