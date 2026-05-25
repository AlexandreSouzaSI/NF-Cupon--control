'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import { CreditCard, FileText, Plus, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

type FiscalDocument = {
    id: string;
    type: 'COUPON' | 'INVOICE';
    fileUrl?: string | null;
};

type Supplier = {
    id: string;
    name: string;
};

type Card = {
    id: string;
    name: string;
    lastDigits?: string | null;
    store: {
        id: string;
        name: string;
    };
};

type Purchase = {
    id: string;
    description: string;
    value: string;
    method: string;
    status: string;
    createdAt: string;
    store: {
        id: string;
        name: string;
    };
    supplier?: {
        id: string;
        name: string;
    } | null;
    card?: {
        id: string;
        name: string;
    } | null;
    createdBy: {
        id: string;
        name: string;
    };
    fiscalDocuments?: FiscalDocument[];
};

const statusLabel: Record<string, string> = {
    DRAFT: 'Rascunho',
    PENDING_APPROVAL: 'Aguardando aprovação',
    APPROVED: 'Aprovada',
    REJECTED: 'Reprovada',
    PURCHASED: 'Comprada',
    WAITING_INVOICE: 'Aguardando NF',
    INVOICE_LINKED: 'NF vinculada',
    CHECKED: 'Conferida',
    CLOSED: 'Fechada',
};

const statusColor: Record<string, string> = {
    DRAFT: 'bg-zinc-800 text-zinc-300',
    PENDING_APPROVAL: 'bg-yellow-500/10 text-yellow-400',
    APPROVED: 'bg-green-500/10 text-green-400',
    REJECTED: 'bg-red-500/10 text-red-400',
    PURCHASED: 'bg-blue-500/10 text-blue-400',
    WAITING_INVOICE: 'bg-orange-500/10 text-orange-400',
    INVOICE_LINKED: 'bg-purple-500/10 text-purple-400',
    CHECKED: 'bg-cyan-500/10 text-cyan-400',
    CLOSED: 'bg-zinc-700 text-zinc-200',
};

function formatCurrency(value: string) {
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export default function PurchasesPage() {
    const router = useRouter();
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    const [description, setDescription] = useState('');
    const [value, setValue] = useState('');
    const [method, setMethod] = useState('CREDIT_CARD');
    const [storeId, setStoreId] = useState('loja-anchieta');
    const [notes, setNotes] = useState('');

    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [supplierId, setSupplierId] = useState('');

    const [statusFilter, setStatusFilter] = useState('');
    const [storeFilter, setStoreFilter] = useState('');
    const [supplierFilter, setSupplierFilter] = useState('');

    const [cards, setCards] = useState<Card[]>([]);
    const [cardId, setCardId] = useState('');

    async function loadCards() {
        try {
            const response = await api.get('/cards');
            setCards(response.data);
        } catch {
            toast.error('Erro ao carregar cartões');
        }
    }

    async function checkPurchase(id: string) {
        try {
            await api.post(`/purchases/${id}/check`);

            toast.success('Compra conferida');

            await loadPurchases();
        } catch {
            toast.error('Erro ao conferir compra');
        }
    }

    async function closePurchase(id: string) {
        try {
            await api.post(`/purchases/${id}/close`);

            toast.success('Requisição de compra fechada');

            await loadPurchases();
        } catch {
            toast.error('Erro ao fechar requisição de compra');
        }
    }

    async function loadPurchases() {
        try {
            setLoading(true);
            const response = await api.get('/purchases', {
                params: {
                    status: statusFilter || undefined,
                    storeId: storeFilter || undefined,
                    supplierId: supplierFilter || undefined,
                }
            });
            setPurchases(response.data);
        } catch {
            toast.error('Erro ao carregar requisições de compra');
        } finally {
            setLoading(false);
        }
    }

    async function loadSuppliers() {
        try {
            const response = await api.get('/suppliers');
            setSuppliers(response.data);
        } catch {
            toast.error('Erro ao carregar fornecedores');
        }
    }

    async function handleCreatePurchase(e: React.FormEvent) {
        e.preventDefault();

        if (!description || !storeId || !notes) {
            toast.error('Preencha descrição, loja e motivo');
            return;
        }

        try {
            setCreating(true);

            await api.post('/purchases', {
                description,
                value: value ? Number(value.replace(',', '.')) : 0,
                method,
                storeId,
                notes,
                supplierId: supplierId || undefined,
                cardId: method === 'CREDIT_CARD' ? cardId || undefined : undefined,
            });

            toast.success('Requisição de compra cadastrada');

            setDescription('');
            setValue('');
            setNotes('');
            setSupplierId('');
            setCardId('');

            await loadPurchases();
        } catch {
            toast.error('Erro ao cadastrar requisição de compra');
        } finally {
            setCreating(false);
        }
    }

    async function addCoupon(purchaseId: string, file: File) {
        const formData = new FormData();

        formData.append('file', file);
        formData.append('type', 'COUPON');

        try {
            await api.post(
                `/purchases/${purchaseId}/fiscal-documents/upload`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                },
            );

            toast.success('Cupom enviado. Compra aguardando NF.');
            await loadPurchases();
        } catch {
            toast.error('Erro ao enviar cupom');
        }
    }

    useEffect(() => {
        loadPurchases();
        loadSuppliers();
        loadCards();
    }, []);

    useEffect(() => {
        loadPurchases();
    }, [statusFilter, storeFilter, supplierFilter]);

    return (
        <AppLayout title="Requisição de Compra">
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
                <form
                    onSubmit={handleCreatePurchase}
                    className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5"
                >
                    <div className="mb-5 flex items-center gap-3">
                        <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                            <Plus size={22} />
                        </div>

                        <div>
                            <h2 className="text-lg font-bold">Nova requisição</h2>
                            <p className="text-sm text-zinc-400">
                                Solicite ou registre uma compra para aprovação
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm text-zinc-300">
                                Descrição
                            </label>
                            <input
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Ex: Compra de bebidas"
                                className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-300">
                                Valor estimado
                            </label>
                            <input
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder="Ex: 450,00"
                                inputMode="decimal"
                                className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-300">
                                Forma de pagamento
                            </label>
                            <select
                                value={method}
                                onChange={(e) => setMethod(e.target.value)}
                                className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            >
                                <option value="CREDIT_CARD">Cartão de crédito</option>
                                <option value="CASH">Dinheiro</option>
                                <option value="PIX">PIX</option>
                                <option value="COMPANY_ACCOUNT">Conta empresa</option>
                            </select>
                        </div>

                        {method === 'CREDIT_CARD' && (
                            <div>
                                <label className="mb-2 block text-sm text-zinc-300">
                                    Cartão
                                </label>

                                <select
                                    value={cardId}
                                    onChange={(e) => setCardId(e.target.value)}
                                    className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                                >
                                    <option value="">Selecione o cartão</option>

                                    {cards.map((card) => (
                                        <option key={card.id} value={card.id}>
                                            {card.name}
                                            {card.lastDigits ? ` • final ${card.lastDigits}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="mb-2 block text-sm text-zinc-300">
                                Loja
                            </label>
                            <select
                                value={storeId}
                                onChange={(e) => setStoreId(e.target.value)}
                                className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            >
                                <option value="loja-anchieta">Loja Anchieta</option>
                                <option value="loja-eldorado">Loja Eldorado</option>
                                <option value="loja-contagem">Loja Contagem</option>
                            </select>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-300">
                                Fornecedor
                            </label>

                            <select
                                value={supplierId}
                                onChange={(e) => setSupplierId(e.target.value)}
                                className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            >
                                <option value="">Sem fornecedor</option>

                                {suppliers.map((supplier) => (
                                    <option key={supplier.id} value={supplier.id}>
                                        {supplier.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-300">
                                Motivo da compra
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Detalhes da compra, motivo ou urgência"
                                className="min-h-24 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-green-500"
                            />
                        </div>

                        <button
                            disabled={creating}
                            className="h-12 w-full rounded-xl bg-green-500 font-semibold text-white hover:bg-green-600 disabled:opacity-50"
                        >
                            {creating ? 'Salvando...' : 'Enviar requisição'}
                        </button>
                    </div>
                </form>

                <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                    <div className="mb-5 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold">Requisição enviada</h2>
                            <p className="text-sm text-zinc-400">
                                Acompanhe status, loja e responsável
                            </p>
                        </div>

                        <ReceiptText className="text-zinc-500" />
                    </div>

                    <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                        >
                            <option value="">Todos os status</option>
                            <option value="PENDING_APPROVAL">Aguardando aprovação</option>
                            <option value="APPROVED">Aprovada</option>
                            <option value="WAITING_INVOICE">Aguardando NF</option>
                            <option value="INVOICE_LINKED">NF vinculada</option>
                            <option value="REJECTED">Reprovada</option>
                            <option value="CLOSED">Fechada</option>
                        </select>

                        <select
                            value={storeFilter}
                            onChange={(e) => setStoreFilter(e.target.value)}
                            className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                        >
                            <option value="">Todas as lojas</option>
                            <option value="loja-anchieta">Loja Anchieta</option>
                            <option value="loja-eldorado">Loja Eldorado</option>
                            <option value="loja-contagem">Loja Contagem</option>
                        </select>

                        <select
                            value={supplierFilter}
                            onChange={(e) => setSupplierFilter(e.target.value)}
                            className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                        >
                            <option value="">Todos fornecedores</option>

                            {suppliers.map((supplier) => (
                                <option key={supplier.id} value={supplier.id}>
                                    {supplier.name}
                                </option>
                            ))}
                        </select>

                        <button
                            onClick={() => {
                                setStatusFilter('');
                                setStoreFilter('');
                                setSupplierFilter('');
                            }}
                            className="mb-5 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                        >
                            Limpar filtros
                        </button>
                    </div>

                    {loading ? (
                        <p className="text-sm text-zinc-400">Carregando...</p>
                    ) : purchases.length === 0 ? (
                        <p className="text-sm text-zinc-400">
                            Nenhuma requisição de compra cadastrada ainda.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {purchases.map((purchase) => (
                                <div
                                    key={purchase.id}
                                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                                >
                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div>
                                            <div className="mb-2 flex items-center gap-2">
                                                <CreditCard size={18} className="text-green-400" />
                                                <h3 className="font-semibold">
                                                    {purchase.description}
                                                </h3>
                                            </div>

                                            <p className="text-sm text-zinc-400">
                                                {purchase.store.name} • {purchase.createdBy.name}
                                                {purchase.supplier?.name && ` • ${purchase.supplier.name}`}
                                            </p>

                                            <p className="mt-1 text-sm text-zinc-500">
                                                {new Date(purchase.createdAt).toLocaleDateString(
                                                    'pt-BR',
                                                )}
                                            </p>

                                            {purchase.fiscalDocuments &&
                                                purchase.fiscalDocuments.length > 0 && (
                                                    <div className="mt-3 space-y-2">
                                                        {purchase.fiscalDocuments.map((doc) => {
                                                            if (!doc.fileUrl) return null;

                                                            return (
                                                                <a
                                                                    key={doc.id}
                                                                    href={`${API_URL}${doc.fileUrl}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="inline-flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm font-medium text-green-400 hover:bg-green-500/20"
                                                                >
                                                                    <FileText size={16} />
                                                                    Abrir{' '}
                                                                    {doc.type === 'COUPON' ? 'cupom' : 'NF'}
                                                                </a>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                        </div>

                                        <div className="text-left md:text-right">
                                            <strong className="block text-xl">
                                                {formatCurrency(purchase.value)}
                                            </strong>

                                            <span
                                                className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusColor[purchase.status]
                                                    }`}
                                            >
                                                {statusLabel[purchase.status]}
                                            </span>

                                            {purchase.status === 'APPROVED' && (
                                                <label className="mt-3 inline-flex w-full cursor-pointer justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm font-medium text-orange-400 hover:bg-orange-500/20 md:w-auto">
                                                    Enviar cupom

                                                    <input
                                                        type="file"
                                                        accept="image/*,.pdf,.xml"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];

                                                            if (file) {
                                                                addCoupon(purchase.id, file);
                                                            }
                                                        }}
                                                    />
                                                </label>
                                            )}
                                            {purchase.status === 'INVOICE_LINKED' && (
                                                <button
                                                    onClick={() => checkPurchase(purchase.id)}
                                                    className="mt-3 w-full rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/20 md:w-auto"
                                                >
                                                    Conferir compra
                                                </button>
                                            )}
                                            {purchase.status === 'CHECKED' && (
                                                <button
                                                    onClick={() => closePurchase(purchase.id)}
                                                    className="mt-3 w-full rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 hover:bg-green-500/20 md:w-auto"
                                                >
                                                    Fechar compra
                                                </button>
                                            )}
                                            <button
                                                onClick={() => router.push(`/purchases/${purchase.id}`)}
                                                className="mt-3 w-full rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 md:w-auto"
                                            >
                                                Ver detalhes
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </AppLayout>
    );
}