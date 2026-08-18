'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Truck } from 'lucide-react';
import { toast } from 'sonner';

type Supplier = {
    id: string;
    name: string;
    cnpj?: string | null;
    phone?: string | null;
};

export function SuppliersTab() {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    const [name, setName] = useState('');
    const [cnpj, setCnpj] = useState('');
    const [phone, setPhone] = useState('');

    async function loadSuppliers() {
        try {
            setLoading(true);
            const response = await api.get('/suppliers');
            setSuppliers(response.data);
        } catch {
            toast.error('Erro ao carregar fornecedores');
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateSupplier(e: React.FormEvent) {
        e.preventDefault();

        if (!name.trim()) {
            toast.error('Informe o nome do fornecedor');
            return;
        }

        try {
            setCreating(true);

            await api.post('/suppliers', {
                name,
                cnpj: cnpj || undefined,
                phone: phone || undefined,
            });

            toast.success('Fornecedor cadastrado');

            setName('');
            setCnpj('');
            setPhone('');

            await loadSuppliers();
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao cadastrar fornecedor';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setCreating(false);
        }
    }

    useEffect(() => {
        loadSuppliers();
    }, []);

    return (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
            <form
                onSubmit={handleCreateSupplier}
                className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
            >
                <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                        <Plus size={22} />
                    </div>

                    <div>
                        <h2 className="text-lg font-bold">Novo fornecedor</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Cadastre empresas e locais de compra
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Nome
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Distribuidora Souza"
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            CNPJ
                        </label>
                        <input
                            value={cnpj}
                            onChange={(e) => setCnpj(e.target.value)}
                            placeholder="00.000.000/0001-00"
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Telefone
                        </label>
                        <input
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="(31) 99999-9999"
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <button
                        disabled={creating}
                        className="h-12 w-full rounded-xl bg-green-500 font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                    >
                        {creating ? 'Salvando...' : 'Cadastrar fornecedor'}
                    </button>
                </div>
            </form>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold">
                            Fornecedores cadastrados
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Locais usados nas compras e NFs
                        </p>
                    </div>

                    <Truck className="text-zinc-500" />
                </div>

                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando...</p>
                ) : suppliers.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhum fornecedor cadastrado ainda.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {suppliers.map((supplier) => (
                            <div
                                key={supplier.id}
                                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                            >
                                <p className="font-semibold">{supplier.name}</p>

                                <div className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                                    <p>CNPJ: {supplier.cnpj || 'Não informado'}</p>
                                    <p>Telefone: {supplier.phone || 'Não informado'}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
