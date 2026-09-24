'use client';

import { useEffect, useRef, useState } from 'react';

export type AutocompleteOption = {
    id: string;
    nome: string;
};

// Campo de texto limpo com autocomplete — digita e filtra a lista pelo
// que já foi digitado (contains, sem acento/maiúscula importando), em
// vez de abrir um <select> com a lista inteira. Clicar numa opção (ou
// navegar com seta + Enter) seleciona; se o texto não bater com nenhuma
// opção quando o campo perde o foco, volta pro nome do item selecionado
// (ou fica vazio, se nada estiver selecionado) — não deixa "meio
// digitado" nem salva um id que não existe.
export function AutocompleteInput({
    options,
    value,
    onChange,
    placeholder,
    className,
}: {
    options: AutocompleteOption[];
    value: string;
    onChange: (id: string) => void;
    placeholder?: string;
    className?: string;
}) {
    const selecionado = options.find((o) => o.id === value) || null;

    const [query, setQuery] = useState(selecionado?.nome || '');
    const [aberto, setAberto] = useState(false);
    const [indiceAtivo, setIndiceAtivo] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Sincroniza o texto exibido quando o valor selecionado muda por
    // fora (ex: troca de linha, carregamento inicial) — só quando o
    // campo não está com foco/aberto, pra não atropelar o que o usuário
    // está digitando.
    useEffect(() => {
        if (!aberto) {
            setQuery(selecionado?.nome || '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const normalizado = query.trim().toLowerCase();
    const filtradas = normalizado
        ? options.filter((o) => o.nome.toLowerCase().includes(normalizado))
        : options;
    const listaExibida = filtradas.slice(0, 50);

    function selecionar(opcao: AutocompleteOption) {
        onChange(opcao.id);
        setQuery(opcao.nome);
        setAberto(false);
    }

    function handleBlur() {
        // Pequeno atraso pra deixar o onMouseDown da opção rodar antes
        // do blur fechar a lista (senão o clique nunca registra).
        setTimeout(() => {
            setAberto(false);
            const atual = options.find((o) => o.id === value) || null;
            setQuery(atual?.nome || '');
        }, 120);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (!aberto && (e.key === 'ArrowDown' || e.key === 'Enter')) {
            setAberto(true);
            return;
        }
        if (!aberto) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIndiceAtivo((i) => Math.min(i + 1, listaExibida.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIndiceAtivo((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const opcao = listaExibida[indiceAtivo];
            if (opcao) selecionar(opcao);
        } else if (e.key === 'Escape') {
            setAberto(false);
        }
    }

    return (
        <div ref={containerRef} className="relative flex-1">
            <input
                type="text"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setIndiceAtivo(0);
                    setAberto(true);
                    if (value) onChange('');
                }}
                onFocus={() => setAberto(true)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={
                    className ||
                    'w-full bg-transparent py-1.5 text-sm outline-none placeholder:text-zinc-400'
                }
                autoComplete="off"
            />

            {aberto && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                    {listaExibida.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-zinc-400">
                            Nenhum item encontrado.
                        </p>
                    ) : (
                        listaExibida.map((opcao, i) => (
                            <button
                                key={opcao.id}
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    selecionar(opcao);
                                }}
                                onMouseEnter={() => setIndiceAtivo(i)}
                                className={`block w-full truncate px-3 py-1.5 text-left text-sm ${
                                    i === indiceAtivo
                                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                        : 'text-zinc-700 dark:text-zinc-200'
                                }`}
                            >
                                {opcao.nome}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
