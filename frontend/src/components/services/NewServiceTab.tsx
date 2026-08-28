'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
    PIX: 'Pix',
    DINHEIRO: 'Dinheiro',
    TRANSFERENCIA: 'Transferência',
    BOLETO: 'Boleto',
    OUTRO: 'Outro',
};

const PIX_KEY_TYPE_LABELS: Record<string, string> = {
    CPF: 'CPF',
    CNPJ: 'CNPJ',
    EMAIL: 'E-mail',
    PHONE: 'Telefone',
    RANDOM: 'Chave aleatória',
    EVP: 'EVP',
};

export function NewServiceTab() {
    const [creating, setCreating] = useState(false);

    const [name, setName] = useState('');
    const [providerName, setProviderName] = useState('');
    const [description, setDescription] = useState('');
    const [value, setValue] = useState('');
    const [serviceDate, setServiceDate] = useState('');
    const [notes, setNotes] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('PIX');
    const [pixKey, setPixKey] = useState('');
    const [pixKeyType, setPixKeyType] = useState('CPF');

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();

        if (!name.trim() || !providerName.trim()) {
            toast.error('Informe o nome do serviço e o prestador.');
            return;
        }

        if (!value || Number(value) <= 0) {
            toast.error('Informe um valor válido.');
            return;
        }

        if (!serviceDate) {
            toast.error('Informe a data do serviço.');
            return;
        }

        const storeId = getActiveStore()?.id;

        if (!storeId) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        try {
            setCreating(true);

            await api.post('/services', {
                name: name.trim(),
                providerName: providerName.trim(),
                description: description.trim() || undefined,
                value: Number(value),
                serviceDate,
                notes: notes.trim() || undefined,
                paymentMethod,
                pixKey:
                    paymentMethod === 'PIX'
                        ? pixKey.trim() || undefined
                        : undefined,
                pixKeyType:
                    paymentMethod === 'PIX' && pixKey.trim()
                        ? pixKeyType
                        : undefined,
                storeId,
            });

            toast.success('Serviço cadastrado.');

            setName('');
            setProviderName('');
            setDescription('');
            setValue('');
            setServiceDate('');
            setNotes('');
            setPaymentMethod('PIX');
            setPixKey('');
            setPixKeyType('CPF');
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao cadastrar serviço.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setCreating(false);
        }
    }

    return (
        <div className="mx-auto max-w-xl">
            <form
                onSubmit={handleCreate}
                className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
            >
                <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                        <Plus size={22} />
                    </div>

                    <div>
                        <h2 className="text-lg font-bold">Novo serviço</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Cadastre o serviço prestado e anexe a NF quando
                            ela chegar (na aba Serviços).
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Nome do serviço
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Manutenção do ar condicionado"
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Prestador
                        </label>
                        <input
                            value={providerName}
                            onChange={(e) => setProviderName(e.target.value)}
                            placeholder="Ex: João Manutenções"
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Valor
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder="0,00"
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Data
                            </label>
                            <input
                                type="date"
                                value={serviceDate}
                                onChange={(e) => setServiceDate(e.target.value)}
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Descrição (opcional)
                        </label>
                        <input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Detalhes do serviço"
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Observações (opcional)
                        </label>
                        <input
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Observações internas"
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Forma de pagamento
                            </label>
                            <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            >
                                {Object.entries(PAYMENT_METHOD_LABELS).map(
                                    ([key, label]) => (
                                        <option key={key} value={key}>
                                            {label}
                                        </option>
                                    ),
                                )}
                            </select>
                        </div>

                        {paymentMethod === 'PIX' && (
                            <div>
                                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                    Tipo de chave
                                </label>
                                <select
                                    value={pixKeyType}
                                    onChange={(e) => setPixKeyType(e.target.value)}
                                    className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                                >
                                    {Object.entries(PIX_KEY_TYPE_LABELS).map(
                                        ([key, label]) => (
                                            <option key={key} value={key}>
                                                {label}
                                            </option>
                                        ),
                                    )}
                                </select>
                            </div>
                        )}
                    </div>

                    {paymentMethod === 'PIX' && (
                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Chave Pix (opcional)
                            </label>
                            <input
                                value={pixKey}
                                onChange={(e) => setPixKey(e.target.value)}
                                placeholder="CPF, e-mail, telefone ou chave aleatória"
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>
                    )}

                    <button
                        disabled={creating}
                        className="h-12 w-full rounded-xl bg-green-500 font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                    >
                        {creating ? 'Salvando...' : 'Cadastrar serviço'}
                    </button>
                </div>
            </form>
        </div>
    );
}
