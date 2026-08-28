'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    ArrowRight,
    Building2,
    Camera,
    Check,
    Paperclip,
    Plus,
    ShoppingCart,
    Trash2,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../../src/components/app-layout';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    VoicePurchaseButton,
    type VoicePurchaseDraft,
} from '../../../src/components/purchases/VoicePurchaseButton';

type Supplier = {
    id: string;
    name: string;
};

type Card = {
    id: string;
    name: string;
    lastDigits?: string | null;
    storeId?: string;
    store?: {
        id: string;
        name: string;
    };
};

type PurchaseItemForm = {
    id: string;
    name: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    total: string;
    notes: string;
};

type PurchaseCategory =
    | 'SUPPLIER_ORDER'
    | 'AVULSA_CARD'
    | 'ONLINE_MARKETPLACE';

type PaymentMethod =
    | 'CREDIT_CARD'
    | 'CASH'
    | 'PIX'
    | 'COMPANY_ACCOUNT'
    | 'BOLETO';

type PurchaseOrigin =
    | 'NORMAL'
    | 'WEBSITE'
    | 'MERCADO_LIVRE'
    | 'WHATSAPP'
    | 'PHONE'
    | 'STORE_COUNTER'
    | 'OTHER';

const categoryLabels: Record<PurchaseCategory, string> = {
    SUPPLIER_ORDER: 'Pedido com fornecedor',
    AVULSA_CARD: 'Compra avulsa',
    ONLINE_MARKETPLACE: 'Compra online',
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
    CREDIT_CARD: 'Cartão de crédito',
    CASH: 'Dinheiro',
    PIX: 'PIX',
    COMPANY_ACCOUNT: 'Conta da empresa',
    BOLETO: 'Boleto',
};

const originLabels: Record<PurchaseOrigin, string> = {
    NORMAL: 'Pedido normal',
    WEBSITE: 'Site',
    MERCADO_LIVRE: 'Mercado Livre',
    WHATSAPP: 'WhatsApp',
    PHONE: 'Telefone',
    STORE_COUNTER: 'Compra presencial',
    OTHER: 'Outro',
};

function createEmptyItem(): PurchaseItemForm {
    return {
        id: crypto.randomUUID(),
        name: '',
        quantity: '1',
        unit: 'UN',
        unitPrice: '',
        total: '',
        notes: '',
    };
}

function parseDecimal(value: string) {
    const normalized = value
        .trim()
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.');

    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function toISODate(date: Date) {
    return date.toISOString().slice(0, 10);
}

function todayISO() {
    return toISODate(new Date());
}

function todayPlusDaysISO(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return toISODate(date);
}

export default function NewPurchasePage() {
    const router = useRouter();

    const [step, setStep] = useState(1);
    const [loadingData, setLoadingData] = useState(true);
    const [saving, setSaving] = useState(false);

    const [cards, setCards] = useState<Card[]>([]);

    const [description, setDescription] = useState('');
    const [category, setCategory] =
        useState<PurchaseCategory>('SUPPLIER_ORDER');
    const [origin, setOrigin] = useState<PurchaseOrigin>('NORMAL');
    const [method, setMethod] = useState<PaymentMethod>('BOLETO');

    const activeStore = getActiveStore();
    const storeId = activeStore?.id || '';
    const [supplierId, setSupplierId] = useState('');
    const [supplierQuery, setSupplierQuery] = useState('');
    const [supplierSuggestions, setSupplierSuggestions] = useState<
        Supplier[]
    >([]);
    const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
    const [searchingSuppliers, setSearchingSuppliers] = useState(false);
    const [resolvingSupplier, setResolvingSupplier] = useState(false);
    const [cardId, setCardId] = useState('');

    const [externalOrderCode, setExternalOrderCode] = useState('');
    const [invoiceResponsibleId, setInvoiceResponsibleId] = useState('');
    const [purchasedAt, setPurchasedAt] = useState(() => todayISO());
    const [dueDate, setDueDate] = useState(() => todayPlusDaysISO(7));
    const [notes, setNotes] = useState('');

    const [showMoreDetails, setShowMoreDetails] = useState(false);

    const [items, setItems] = useState<PurchaseItemForm[]>([
        createEmptyItem(),
    ]);

    // Modo simplificado: pra quem não quer digitar item a item. Registra
    // só fornecedor + valor final (vira 1 item por baixo dos panos, pra
    // não quebrar recebimento/divergência que dependem de itens).
    const [simplifiedMode, setSimplifiedMode] = useState(false);
    const [simplifiedValue, setSimplifiedValue] = useState('');

    // Espelho do pedido: foto/PDF do que foi combinado com o fornecedor,
    // opcional em qualquer um dos dois modos.
    const [mirrorFile, setMirrorFile] = useState<File | null>(null);

    useEffect(() => {
        loadBaseData();
    }, []);

    useEffect(() => {
        if (category === 'AVULSA_CARD') {
            setMethod('CREDIT_CARD');
            setOrigin('STORE_COUNTER');
        }

        if (category === 'ONLINE_MARKETPLACE') {
            setMethod('CREDIT_CARD');
            setOrigin('MERCADO_LIVRE');
        }

        if (category === 'SUPPLIER_ORDER') {
            setOrigin('NORMAL');
        }
    }, [category]);

    useEffect(() => {
        if (method !== 'CREDIT_CARD') {
            setCardId('');
        }
    }, [method]);

    // Busca fornecedores enquanto digita (com debounce), pra sugerir os que
    // já existem antes de criar um novo.
    useEffect(() => {
        if (!supplierQuery.trim()) {
            setSupplierSuggestions([]);
            return;
        }

        const timeoutId = setTimeout(async () => {
            try {
                setSearchingSuppliers(true);

                const response = await api.get('/suppliers', {
                    params: { search: supplierQuery.trim() },
                });

                setSupplierSuggestions(response.data || []);
            } catch {
                // silencioso: não trava a digitação por causa da busca
            } finally {
                setSearchingSuppliers(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [supplierQuery]);

    async function loadBaseData() {
        try {
            setLoadingData(true);

            const cardsResponse = await api.get('/cards');

            setCards(cardsResponse.data || []);
        } catch {
            toast.error('Erro ao carregar cartões.');
        } finally {
            setLoadingData(false);
        }
    }

    function selectSupplier(supplier: Supplier) {
        setSupplierId(supplier.id);
        setSupplierQuery(supplier.name);
        setSupplierSuggestions([]);
        setSupplierDropdownOpen(false);
    }

    function handleSupplierQueryChange(value: string) {
        setSupplierQuery(value);
        // Editou o texto depois de já ter escolhido um fornecedor: precisa
        // resolver de novo (pode ser outro fornecedor ou um novo).
        setSupplierId('');
        setSupplierDropdownOpen(true);
    }

    // Garante que existe um supplierId de verdade antes de enviar a compra:
    // usa o fornecedor escolhido na lista, ou cria/reaproveita um pelo nome
    // digitado.
    async function resolveSupplierId(): Promise<string | undefined> {
        if (!supplierQuery.trim()) {
            return undefined;
        }

        if (supplierId) {
            return supplierId;
        }

        try {
            setResolvingSupplier(true);

            const response = await api.post('/suppliers/find-or-create', {
                name: supplierQuery.trim(),
            });

            setSupplierId(response.data.id);

            return response.data.id as string;
        } finally {
            setResolvingSupplier(false);
        }
    }

    const filteredCards = useMemo(() => {
        if (!storeId) {
            return cards;
        }

        return cards.filter((card) => {
            const cardStoreId = card.storeId || card.store?.id;

            return !cardStoreId || cardStoreId === storeId;
        });
    }, [cards, storeId]);

    const calculatedItemsTotal = useMemo(() => {
        return items.reduce((sum, item) => {
            const explicitTotal = parseDecimal(item.total);

            if (explicitTotal > 0) {
                return sum + explicitTotal;
            }

            return (
                sum +
                parseDecimal(item.quantity) *
                parseDecimal(item.unitPrice)
            );
        }, 0);
    }, [items]);

    function updateItem(
        id: string,
        field: keyof PurchaseItemForm,
        value: string,
    ) {
        setItems((currentItems) =>
            currentItems.map((item) => {
                if (item.id !== id) {
                    return item;
                }

                const updatedItem = {
                    ...item,
                    [field]: value,
                };

                if (field === 'quantity' || field === 'unitPrice') {
                    const quantity = parseDecimal(updatedItem.quantity);
                    const unitPrice = parseDecimal(updatedItem.unitPrice);

                    updatedItem.total =
                        quantity > 0 && unitPrice > 0
                            ? String(quantity * unitPrice)
                            : '';
                }

                return updatedItem;
            }),
        );
    }

    function addItem() {
        setItems((currentItems) => [
            ...currentItems,
            createEmptyItem(),
        ]);
    }

    function removeItem(id: string) {
        setItems((currentItems) => {
            if (currentItems.length === 1) {
                toast.error('A compra precisa ter pelo menos um item.');
                return currentItems;
            }

            return currentItems.filter((item) => item.id !== id);
        });
    }

    // Preenche as etapas 1 e 2 a partir do rascunho devolvido pela
    // transcrição por voz, e leva direto pra Revisão — a pessoa confere e
    // ajusta o que precisar antes de confirmar, exatamente como faria no
    // preenchimento manual.
    function applyVoiceDraft(result: {
        transcript: string;
        draft: VoicePurchaseDraft;
    }) {
        const { draft, transcript } = result;

        setDescription(draft.description);

        if (draft.supplierName) {
            setCategory('SUPPLIER_ORDER');
            setSupplierId('');
            setSupplierQuery(draft.supplierName);
        }

        if (draft.paymentMethod) {
            setMethod(draft.paymentMethod);
        }

        if (draft.items.length > 0) {
            setItems(
                draft.items.map((item) => {
                    const quantity = item.quantity > 0 ? item.quantity : 1;
                    const unitPrice = item.unitPrice || undefined;
                    const total =
                        item.total ||
                        (unitPrice ? quantity * unitPrice : undefined);

                    return {
                        id: crypto.randomUUID(),
                        name: item.name,
                        quantity: String(quantity),
                        unit: item.unit || 'UN',
                        unitPrice: unitPrice ? String(unitPrice) : '',
                        total: total ? String(total) : '',
                        notes: '',
                    };
                }),
            );
        }

        const noteParts: string[] = [];

        if (draft.notes) {
            noteParts.push(draft.notes);
        }

        noteParts.push(`Cadastrado por voz. Transcrição: "${transcript}"`);
        setNotes(noteParts.join('\n\n'));

        if (draft.informedTotalValue && draft.items.length > 0) {
            const itemsSum = draft.items.reduce((sum, item) => {
                const itemTotal =
                    item.total ||
                    (item.unitPrice ? item.quantity * item.unitPrice : 0);

                return sum + itemTotal;
            }, 0);

            if (Math.abs(itemsSum - draft.informedTotalValue) > 0.01) {
                toast(
                    `O valor total dito no áudio (${formatCurrency(
                        draft.informedTotalValue,
                    )}) é diferente da soma dos itens (${formatCurrency(
                        itemsSum,
                    )}) — confira antes de salvar.`,
                );
            }
        }

        setStep(3);
    }

    function validateStepOne() {
        if (!storeId) {
            toast.error(
                'Não foi possível identificar a loja ativa. Saia e entre novamente.',
            );
            return false;
        }

        if (!description.trim()) {
            toast.error('Informe a descrição da compra.');
            return false;
        }

        if (
            category === 'SUPPLIER_ORDER' &&
            !supplierQuery.trim()
        ) {
            toast.error('Informe o fornecedor.');
            return false;
        }

        if (method === 'CREDIT_CARD' && !cardId) {
            toast.error('Selecione o cartão.');
            return false;
        }

        if (simplifiedMode && parseDecimal(simplifiedValue) <= 0) {
            toast.error('Informe o valor final da compra.');
            return false;
        }

        return true;
    }

    function validateStepTwo() {
        if (simplifiedMode) {
            return true;
        }

        const validItems = items.filter(
            (item) =>
                item.name.trim() &&
                parseDecimal(item.quantity) > 0,
        );

        if (validItems.length === 0) {
            toast.error('Cadastre pelo menos um item válido.');
            return false;
        }

        const hasInvalidItem = items.some(
            (item) =>
                !item.name.trim() ||
                parseDecimal(item.quantity) <= 0,
        );

        if (hasInvalidItem) {
            toast.error(
                'Preencha o nome e a quantidade de todos os itens.',
            );
            return false;
        }

        return true;
    }

    function goToNextStep() {
        if (step === 1 && !validateStepOne()) {
            return;
        }

        if (step === 2 && !validateStepTwo()) {
            return;
        }

        if (step === 1 && simplifiedMode) {
            setStep(3);
            return;
        }

        setStep((currentStep) =>
            Math.min(currentStep + 1, 3),
        );
    }

    function goToPreviousStep() {
        if (step === 3 && simplifiedMode) {
            setStep(1);
            return;
        }

        setStep((currentStep) =>
            Math.max(currentStep - 1, 1),
        );
    }

    async function handleSubmit() {
        if (!validateStepOne() || !validateStepTwo()) {
            return;
        }

        try {
            setSaving(true);

            const resolvedSupplierId = await resolveSupplierId();

            let normalizedItems: {
                name: string;
                quantity: number;
                unit?: string;
                unitPrice?: number;
                total?: number;
                notes?: string;
            }[];
            let purchaseValue: number;

            if (simplifiedMode) {
                purchaseValue = parseDecimal(simplifiedValue);
                normalizedItems = [
                    {
                        name: description.trim() || 'Pedido completo',
                        quantity: 1,
                        unit: 'UN',
                        total: purchaseValue,
                    },
                ];
            } else {
                normalizedItems = items.map((item) => {
                    const quantity = parseDecimal(item.quantity);
                    const unitPrice = parseDecimal(item.unitPrice);
                    const explicitTotal = parseDecimal(item.total);

                    return {
                        name: item.name.trim(),
                        quantity,
                        unit: item.unit || undefined,
                        unitPrice:
                            unitPrice > 0 ? unitPrice : undefined,
                        total:
                            explicitTotal > 0
                                ? explicitTotal
                                : quantity * unitPrice || undefined,
                        notes: item.notes.trim() || undefined,
                    };
                });

                purchaseValue = normalizedItems.reduce(
                    (sum, item) => sum + Number(item.total || 0),
                    0,
                );
            }

            const response = await api.post('/purchases', {
                description: description.trim(),
                value: purchaseValue,
                method,
                storeId,
                supplierId: resolvedSupplierId,
                cardId:
                    method === 'CREDIT_CARD'
                        ? cardId || undefined
                        : undefined,
                category,
                origin,
                externalOrderCode:
                    externalOrderCode.trim() || undefined,
                invoiceResponsibleId:
                    invoiceResponsibleId || undefined,
                purchasedAt: purchasedAt || undefined,
                dueDate: dueDate || undefined,
                notes: notes.trim() || undefined,
                items: normalizedItems,
            });

            if (mirrorFile) {
                const mirrorFormData = new FormData();
                mirrorFormData.append('file', mirrorFile);

                try {
                    await api.post(
                        `/purchases/${response.data.id}/order-mirror`,
                        mirrorFormData,
                        { headers: { 'Content-Type': 'multipart/form-data' } },
                    );
                } catch {
                    toast.error(
                        'Compra cadastrada, mas o espelho do pedido não foi enviado.',
                    );
                }
            }

            toast.success('Compra cadastrada com sucesso.');
            router.push('/purchases');
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao cadastrar compra.';

            toast.error(
                Array.isArray(message)
                    ? message.join(', ')
                    : message,
            );
        } finally {
            setSaving(false);
        }
    }

    const selectedCard = cards.find(
        (card) => card.id === cardId,
    );

    if (loadingData) {
        return (
            <AppLayout title="Nova compra">
                <p className="text-zinc-600 dark:text-zinc-400">
                    Carregando dados...
                </p>
            </AppLayout>
        );
    }

    return (
        <AppLayout title="Nova compra">
            <div className="mx-auto max-w-6xl space-y-5">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold">
                            Cadastro de compra
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Registre a compra, os itens e confira tudo antes
                            de salvar.
                        </p>
                    </div>

                    {step === 1 && (
                        <div className="flex flex-col items-start gap-1 sm:items-end">
                            <VoicePurchaseButton
                                onDraftReady={applyVoiceDraft}
                            />
                            <p className="text-xs text-zinc-500 sm:text-right">
                                Fale o fornecedor, a forma de pagamento e
                                os itens — o sistema preenche tudo e leva
                                pra revisão.
                            </p>
                        </div>
                    )}
                </header>

                <div
                    className={`grid gap-2 ${simplifiedMode ? 'grid-cols-2' : 'grid-cols-3'
                        }`}
                >
                    {(simplifiedMode
                        ? [
                            { number: 1, label: 'Informações' },
                            { number: 3, label: 'Revisão' },
                        ]
                        : [
                            { number: 1, label: 'Informações' },
                            { number: 2, label: 'Itens' },
                            { number: 3, label: 'Revisão' },
                        ]
                    ).map((item) => {
                        const active = step === item.number;
                        const completed = step > item.number;

                        return (
                            <div
                                key={item.number}
                                className={`rounded-2xl border p-4 ${active
                                    ? 'border-emerald-500 bg-emerald-500/10'
                                    : completed
                                        ? 'border-emerald-500/30 bg-emerald-500/5'
                                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`flex h-9 w-9 items-center justify-center rounded-full ${active || completed
                                            ? 'bg-emerald-500 text-zinc-900 dark:text-white'
                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                                            }`}
                                    >
                                        {completed ? (
                                            <Check size={18} />
                                        ) : (
                                            item.number
                                        )}
                                    </div>

                                    <span className="font-medium">
                                        {item.label}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {step === 1 && (
                    <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-400">
                                <ShoppingCart size={22} />
                            </div>

                            <div>
                                <h3 className="text-lg font-bold">
                                    Informações gerais
                                </h3>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    Informe onde, como e por que a compra
                                    foi realizada.
                                </p>
                            </div>
                        </div>

                        <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                            <Building2 size={18} className="text-emerald-400" />
                            <span className="text-sm text-zinc-700 dark:text-zinc-300">
                                Registrando compra para
                            </span>
                            <strong className="text-emerald-400">
                                {activeStore?.name || 'loja não identificada'}
                            </strong>
                        </div>

                        <button
                            type="button"
                            onClick={() => setSimplifiedMode((current) => !current)}
                            className={`mb-5 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${simplifiedMode
                                ? 'border-emerald-500 bg-emerald-500/10'
                                : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950'
                                }`}
                        >
                            <div>
                                <p className="text-sm font-semibold">
                                    Cadastro simplificado
                                </p>
                                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                    Sem listar item a item — só fornecedor e
                                    valor final. Ideal pra pedidos com muitos
                                    itens.
                                </p>
                            </div>

                            <div
                                className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${simplifiedMode
                                    ? 'bg-emerald-500'
                                    : 'bg-zinc-300 dark:bg-zinc-700'
                                    }`}
                            >
                                <div
                                    className={`h-5 w-5 rounded-full bg-white transition ${simplifiedMode ? 'translate-x-5' : ''
                                        }`}
                                />
                            </div>
                        </button>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                    Tipo da compra
                                </label>

                                <select
                                    value={category}
                                    onChange={(event) =>
                                        setCategory(
                                            event.target
                                                .value as PurchaseCategory,
                                        )
                                    }
                                    className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                                >
                                    <option value="SUPPLIER_ORDER">
                                        Pedido com fornecedor
                                    </option>
                                    <option value="AVULSA_CARD">
                                        Compra avulsa
                                    </option>
                                    <option value="ONLINE_MARKETPLACE">
                                        Compra online
                                    </option>
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                    Descrição
                                </label>

                                <input
                                    value={description}
                                    onChange={(event) =>
                                        setDescription(
                                            event.target.value,
                                        )
                                    }
                                    placeholder="Ex.: Pedido semanal de carnes"
                                    className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                    Forma de pagamento
                                </label>

                                <select
                                    value={method}
                                    onChange={(event) =>
                                        setMethod(
                                            event.target
                                                .value as PaymentMethod,
                                        )
                                    }
                                    className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                                >
                                    {Object.entries(
                                        paymentMethodLabels,
                                    ).map(([value, label]) => (
                                        <option
                                            key={value}
                                            value={value}
                                        >
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="relative">
                                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                    Fornecedor
                                </label>

                                <input
                                    value={supplierQuery}
                                    onChange={(event) =>
                                        handleSupplierQueryChange(
                                            event.target.value,
                                        )
                                    }
                                    onFocus={() =>
                                        setSupplierDropdownOpen(true)
                                    }
                                    onBlur={() =>
                                        setTimeout(
                                            () =>
                                                setSupplierDropdownOpen(
                                                    false,
                                                ),
                                            150,
                                        )
                                    }
                                    placeholder="Digite o nome do fornecedor"
                                    className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                                />

                                {supplierDropdownOpen &&
                                    supplierQuery.trim() && (
                                        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
                                            {searchingSuppliers ? (
                                                <p className="px-4 py-3 text-sm text-zinc-500">
                                                    Buscando...
                                                </p>
                                            ) : supplierSuggestions.length >
                                              0 ? (
                                                supplierSuggestions.map(
                                                    (supplier) => (
                                                        <button
                                                            type="button"
                                                            key={supplier.id}
                                                            onMouseDown={() =>
                                                                selectSupplier(
                                                                    supplier,
                                                                )
                                                            }
                                                            className="block w-full px-4 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                        >
                                                            {supplier.name}
                                                        </button>
                                                    ),
                                                )
                                            ) : (
                                                <p className="px-4 py-3 text-sm text-zinc-500">
                                                    Nenhum fornecedor
                                                    encontrado. Ao salvar,{' '}
                                                    <strong>
                                                        {supplierQuery.trim()}
                                                    </strong>{' '}
                                                    será cadastrado
                                                    automaticamente.
                                                </p>
                                            )}
                                        </div>
                                    )}
                            </div>

                            {simplifiedMode && (
                                <div>
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        Valor final
                                    </label>

                                    <input
                                        value={simplifiedValue}
                                        onChange={(event) =>
                                            setSimplifiedValue(event.target.value)
                                        }
                                        inputMode="decimal"
                                        placeholder="0,00"
                                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                                    />
                                </div>
                            )}

                            {method === 'CREDIT_CARD' && (
                                <div>
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        Cartão
                                    </label>

                                    <select
                                        value={cardId}
                                        onChange={(event) =>
                                            setCardId(
                                                event.target.value,
                                            )
                                        }
                                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                                    >
                                        <option value="">
                                            Selecione o cartão
                                        </option>

                                        {filteredCards.map((card) => (
                                            <option
                                                key={card.id}
                                                value={card.id}
                                            >
                                                {card.name}
                                                {card.lastDigits
                                                    ? ` • final ${card.lastDigits}`
                                                    : ''}
                                            </option>
                                        ))}
                                    </select>

                                    {filteredCards.length === 0 && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                router.push(
                                                    '/cadastros?tab=cartoes',
                                                )
                                            }
                                            className="mt-2 text-sm font-medium text-emerald-500 hover:text-emerald-400"
                                        >
                                            Nenhum cartão nessa loja ainda —
                                            cadastrar um cartão
                                        </button>
                                    )}
                                </div>
                            )}

                            {category ===
                                'ONLINE_MARKETPLACE' && (
                                    <div>
                                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                            Código do pedido
                                        </label>

                                        <input
                                            value={externalOrderCode}
                                            onChange={(event) =>
                                                setExternalOrderCode(
                                                    event.target.value,
                                                )
                                            }
                                            placeholder="Ex.: ML-123456789"
                                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                )}

                        </div>

                        <div className="mt-4">
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Espelho do pedido (opcional)
                            </label>
                            <p className="mb-2 text-xs text-zinc-500">
                                Print do WhatsApp, orçamento ou confirmação do
                                pedido — fica salvo pra conferir depois.
                            </p>

                            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-3">
                                {mirrorFile ? (
                                    <p className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                                        <Paperclip size={12} />
                                        {mirrorFile.name}
                                        <button
                                            type="button"
                                            onClick={() => setMirrorFile(null)}
                                            className="ml-1 text-zinc-400 hover:text-red-500"
                                        >
                                            <X size={12} />
                                        </button>
                                    </p>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                document
                                                    .getElementById('order-mirror-camera')
                                                    ?.click()
                                            }
                                            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                        >
                                            <Camera size={14} />
                                            Tirar foto
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                document
                                                    .getElementById('order-mirror-file')
                                                    ?.click()
                                            }
                                            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                        >
                                            <Paperclip size={14} />
                                            Escolher arquivo
                                        </button>
                                    </div>
                                )}
                            </div>

                            <input
                                id="order-mirror-camera"
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(event) =>
                                    setMirrorFile(event.target.files?.[0] || null)
                                }
                                className="hidden"
                            />
                            <input
                                id="order-mirror-file"
                                type="file"
                                onChange={(event) =>
                                    setMirrorFile(event.target.files?.[0] || null)
                                }
                                className="hidden"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() =>
                                setShowMoreDetails((current) => !current)
                            }
                            className="mt-4 text-sm font-medium text-emerald-500 hover:text-emerald-400"
                        >
                            {showMoreDetails
                                ? '− Ocultar mais detalhes'
                                : '+ Mais detalhes (data, vencimento, observações)'}
                        </button>

                        {showMoreDetails && (
                            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800 md:grid-cols-2">
                                <div>
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        Origem da compra
                                    </label>

                                    <select
                                        value={origin}
                                        onChange={(event) =>
                                            setOrigin(
                                                event.target
                                                    .value as PurchaseOrigin,
                                            )
                                        }
                                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                                    >
                                        {Object.entries(originLabels).map(
                                            ([value, label]) => (
                                                <option
                                                    key={value}
                                                    value={value}
                                                >
                                                    {label}
                                                </option>
                                            ),
                                        )}
                                    </select>
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        Data da compra
                                    </label>

                                    <input
                                        type="date"
                                        value={purchasedAt}
                                        onChange={(event) =>
                                            setPurchasedAt(
                                                event.target.value,
                                            )
                                        }
                                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        Vencimento previsto
                                    </label>

                                    <input
                                        type="date"
                                        value={dueDate}
                                        onChange={(event) =>
                                            setDueDate(
                                                event.target.value,
                                            )
                                        }
                                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        Observações
                                    </label>

                                    <textarea
                                        value={notes}
                                        onChange={(event) =>
                                            setNotes(event.target.value)
                                        }
                                        placeholder="Urgência, autorização, informações do pedido ou detalhes adicionais"
                                        className="min-h-28 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 py-3 outline-none focus:border-emerald-500"
                                    />
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {step === 2 && (
                    <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h3 className="text-lg font-bold">
                                    Itens da compra
                                </h3>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    Cadastre o que foi pedido para permitir
                                    a conferência no recebimento.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={addItem}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-700"
                            >
                                <Plus size={18} />
                                Adicionar item
                            </button>
                        </div>

                        <div className="space-y-4">
                            {items.map((item, index) => (
                                <div
                                    key={item.id}
                                    className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                                >
                                    <div className="mb-4 flex items-center justify-between">
                                        <strong>
                                            Item {index + 1}
                                        </strong>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                removeItem(item.id)
                                            }
                                            className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20"
                                        >
                                            <Trash2 size={17} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                                        <div className="md:col-span-2">
                                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                                Produto
                                            </label>

                                            <input
                                                value={item.name}
                                                onChange={(event) =>
                                                    updateItem(
                                                        item.id,
                                                        'name',
                                                        event.target
                                                            .value,
                                                    )
                                                }
                                                placeholder="Ex.: Contra-filé"
                                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 outline-none focus:border-emerald-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                                Quantidade
                                            </label>

                                            <input
                                                value={item.quantity}
                                                onChange={(event) =>
                                                    updateItem(
                                                        item.id,
                                                        'quantity',
                                                        event.target
                                                            .value,
                                                    )
                                                }
                                                inputMode="decimal"
                                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 outline-none focus:border-emerald-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                                Unidade
                                            </label>

                                            <select
                                                value={item.unit}
                                                onChange={(event) =>
                                                    updateItem(
                                                        item.id,
                                                        'unit',
                                                        event.target
                                                            .value,
                                                    )
                                                }
                                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 outline-none focus:border-emerald-500"
                                            >
                                                <option value="UN">
                                                    UN
                                                </option>
                                                <option value="KG">
                                                    KG
                                                </option>
                                                <option value="G">
                                                    G
                                                </option>
                                                <option value="L">
                                                    L
                                                </option>
                                                <option value="ML">
                                                    ML
                                                </option>
                                                <option value="CX">
                                                    CX
                                                </option>
                                                <option value="PCT">
                                                    PCT
                                                </option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                                Valor unitário
                                            </label>

                                            <input
                                                value={item.unitPrice}
                                                onChange={(event) =>
                                                    updateItem(
                                                        item.id,
                                                        'unitPrice',
                                                        event.target
                                                            .value,
                                                    )
                                                }
                                                inputMode="decimal"
                                                placeholder="0,00"
                                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 outline-none focus:border-emerald-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                                Total
                                            </label>

                                            <input
                                                value={item.total}
                                                onChange={(event) =>
                                                    updateItem(
                                                        item.id,
                                                        'total',
                                                        event.target
                                                            .value,
                                                    )
                                                }
                                                inputMode="decimal"
                                                placeholder="0,00"
                                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 outline-none focus:border-emerald-500"
                                            />
                                        </div>

                                        <div className="md:col-span-6">
                                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                                Observação do item
                                            </label>

                                            <input
                                                value={item.notes}
                                                onChange={(event) =>
                                                    updateItem(
                                                        item.id,
                                                        'notes',
                                                        event.target
                                                            .value,
                                                    )
                                                }
                                                placeholder="Marca, tamanho, especificação ou observação"
                                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 outline-none focus:border-emerald-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                            <p className="text-sm text-emerald-300">
                                Valor total calculado
                            </p>
                            <strong className="text-2xl text-emerald-400">
                                {formatCurrency(calculatedItemsTotal)}
                            </strong>
                        </div>
                    </section>
                )}

                {step === 3 && (
                    <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                        <div className="mb-5">
                            <h3 className="text-lg font-bold">
                                Revisão da compra
                            </h3>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                Confira os dados antes de confirmar.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
                                <p className="text-sm text-zinc-500">
                                    Loja
                                </p>
                                <strong>
                                    {activeStore?.name || 'Não informada'}
                                </strong>
                            </div>

                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
                                <p className="text-sm text-zinc-500">
                                    Tipo
                                </p>
                                <strong>
                                    {categoryLabels[category]}
                                </strong>
                            </div>

                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
                                <p className="text-sm text-zinc-500">
                                    Descrição
                                </p>
                                <strong>{description}</strong>
                            </div>

                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
                                <p className="text-sm text-zinc-500">
                                    Fornecedor
                                </p>
                                <strong>
                                    {supplierQuery.trim() ||
                                        'Não informado'}
                                </strong>
                            </div>

                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
                                <p className="text-sm text-zinc-500">
                                    Pagamento
                                </p>
                                <strong>
                                    {paymentMethodLabels[method]}
                                </strong>
                            </div>

                            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
                                <p className="text-sm text-zinc-500">
                                    Cartão
                                </p>
                                <strong>
                                    {selectedCard
                                        ? `${selectedCard.name}${selectedCard.lastDigits
                                            ? ` • final ${selectedCard.lastDigits}`
                                            : ''
                                        }`
                                        : 'Não utilizado'}
                                </strong>
                            </div>
                        </div>

                        {simplifiedMode ? (
                            <div className="mt-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
                                <p className="text-sm text-zinc-500">
                                    Cadastro simplificado — sem item a item
                                </p>
                                {mirrorFile && (
                                    <p className="mt-2 flex items-center gap-1 text-sm text-emerald-500">
                                        <Paperclip size={14} />
                                        {mirrorFile.name}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="mt-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <strong>Itens</strong>
                                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                                        {items.length} item(ns)
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    {items.map((item) => {
                                        const quantity =
                                            parseDecimal(item.quantity);
                                        const itemTotal =
                                            parseDecimal(item.total) ||
                                            quantity *
                                            parseDecimal(
                                                item.unitPrice,
                                            );

                                        return (
                                            <div
                                                key={item.id}
                                                className="flex flex-col gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 md:flex-row md:items-center md:justify-between"
                                            >
                                                <div>
                                                    <strong>
                                                        {item.name}
                                                    </strong>
                                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                                        {quantity}{' '}
                                                        {item.unit}
                                                    </p>
                                                </div>

                                                <strong className="text-emerald-400">
                                                    {formatCurrency(
                                                        itemTotal,
                                                    )}
                                                </strong>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                            <p className="text-sm text-emerald-300">
                                Valor total da compra
                            </p>
                            <strong className="text-3xl text-emerald-400">
                                {formatCurrency(
                                    simplifiedMode
                                        ? parseDecimal(simplifiedValue)
                                        : calculatedItemsTotal,
                                )}
                            </strong>
                        </div>
                    </section>
                )}

                <footer className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                        type="button"
                        onClick={() => {
                            if (step === 1) {
                                router.push('/purchases');
                                return;
                            }

                            goToPreviousStep();
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-3 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    >
                        <ArrowLeft size={18} />
                        {step === 1 ? 'Cancelar' : 'Voltar'}
                    </button>

                    {step < 3 ? (
                        <button
                            type="button"
                            onClick={goToNextStep}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-zinc-900 dark:text-white hover:bg-emerald-700"
                        >
                            Continuar
                            <ArrowRight size={18} />
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled={saving}
                            onClick={handleSubmit}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-zinc-900 dark:text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            <Check size={18} />
                            {saving
                                ? 'Salvando...'
                                : 'Confirmar compra'}
                        </button>
                    )}
                </footer>
            </div>
        </AppLayout>
    );
}