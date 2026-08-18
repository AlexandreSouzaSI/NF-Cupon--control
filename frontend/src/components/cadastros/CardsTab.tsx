'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { CreditCard, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Store = {
    id: string;
    name: string;
};

type Card = {
    id: string;
    name: string;
    lastDigits?: string | null;
    holderName?: string | null;
    store: Store;
};

export function CardsTab() {
    const [cards, setCards] = useState<Card[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    const [name, setName] = useState('');
    const [lastDigits, setLastDigits] = useState('');
    const [holderName, setHolderName] = useState('');
    const [storeId, setStoreId] = useState('');

    async function loadData() {
        try {
            setLoading(true);

            const [cardsResponse, storesResponse] = await Promise.all([
                api.get('/cards'),
                api.get('/stores'),
            ]);

            setCards(cardsResponse.data || []);

            const loadedStores: Store[] = storesResponse.data || [];
            setStores(loadedStores);

            setStoreId((current) => {
                if (current) return current;

                const active = getActiveStore();
                const activeIsAllowed =
                    active && loadedStores.some((store) => store.id === active.id);

                if (activeIsAllowed) return active!.id;

                return loadedStores[0]?.id || '';
            });
        } catch {
            toast.error('Erro ao carregar cartões.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, []);

    async function handleCreateCard(e: React.FormEvent) {
        e.preventDefault();

        if (!name.trim()) {
            toast.error('Informe o nome do cartão.');
            return;
        }

        if (!storeId) {
            toast.error('Selecione a loja do cartão.');
            return;
        }

        try {
            setCreating(true);

            await api.post('/cards', {
                name: name.trim(),
                lastDigits: lastDigits.trim() || undefined,
                holderName: holderName.trim() || undefined,
                storeId,
            });

            toast.success('Cartão cadastrado.');

            setName('');
            setLastDigits('');
            setHolderName('');

            await loadData();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao cadastrar cartão.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setCreating(false);
        }
    }

    async function handleRemoveCard(card: Card) {
        const confirmed = confirm(`Desativar o cartão "${card.name}"?`);

        if (!confirmed) return;

        try {
            await api.delete(`/cards/${card.id}`);
            toast.success('Cartão desativado.');
            await loadData();
        } catch {
            toast.error('Erro ao desativar cartão.');
        }
    }

    return (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
            <form
                onSubmit={handleCreateCard}
                className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
            >
                <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                        <Plus size={22} />
                    </div>

                    <div>
                        <h2 className="text-lg font-bold">Novo cartão</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            O cartão fica vinculado a uma loja e só aparece
                            nas compras feitas nela.
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Loja
                        </label>

                        {stores.length <= 1 ? (
                            <div className="flex h-12 w-full items-center rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 text-zinc-600 dark:text-zinc-400">
                                {stores[0]?.name || 'Nenhuma loja disponível'}
                            </div>
                        ) : (
                            <select
                                value={storeId}
                                onChange={(e) => setStoreId(e.target.value)}
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            >
                                <option value="">Selecione a loja</option>

                                {stores.map((store) => (
                                    <option key={store.id} value={store.id}>
                                        {store.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Nome do cartão
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Cartão Principal Anchieta"
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Final do cartão
                        </label>
                        <input
                            value={lastDigits}
                            onChange={(e) => setLastDigits(e.target.value)}
                            placeholder="0000"
                            maxLength={4}
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Titular
                        </label>
                        <input
                            value={holderName}
                            onChange={(e) => setHolderName(e.target.value)}
                            placeholder="Ex: Empresa"
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <button
                        disabled={creating}
                        className="h-12 w-full rounded-xl bg-green-500 font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                    >
                        {creating ? 'Salvando...' : 'Cadastrar cartão'}
                    </button>
                </div>
            </form>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold">
                            Cartões cadastrados
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Usados como forma de pagamento nas compras
                        </p>
                    </div>

                    <CreditCard className="text-zinc-500" />
                </div>

                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : cards.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhum cartão cadastrado ainda.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {cards.map((card) => (
                            <div
                                key={card.id}
                                className="flex items-center justify-between rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                            >
                                <div>
                                    <p className="font-semibold">
                                        {card.name}
                                        {card.lastDigits
                                            ? ` • final ${card.lastDigits}`
                                            : ''}
                                    </p>

                                    <div className="mt-1 space-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                                        <p>Loja: {card.store.name}</p>
                                        {card.holderName && (
                                            <p>Titular: {card.holderName}</p>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleRemoveCard(card)}
                                    title="Desativar cartão"
                                    className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
