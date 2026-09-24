'use client';

import {
    Suspense,
    useEffect,
    useMemo,
    useState,
} from 'react';

import {
    useRouter,
    useSearchParams,
} from 'next/navigation';

import {
    ArrowLeft,
    Building2,
    FileText,
    ReceiptText,
    Upload,
    Wallet,
} from 'lucide-react';

import { toast } from 'sonner';

import { AppLayout } from '../../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { parseBoletoCode } from '@/lib/boleto';

type Store = {
    id: string;
    name: string;
};

type Supplier = {
    id: string;
    name: string;
};

type Purchase = {
    id: string;
    description: string;
    value: string;
    dueDate?: string | null;

    store: Store;

    supplier?: Supplier | null;

    bills?: {
        id: string;
        status: string;
    }[];

    // Fluxo 2 (compra sem NF e nem vai ter): usados pra saber se é
    // obrigatório pedir descrição dos produtos ou foto da notinha antes
    // de liberar o salvamento da conta.
    fiscalDocuments?: { type: string }[];
    noInvoiceProductsNote?: string | null;

    // Itens da compra — usados só pra pré-preencher a Descrição da conta
    // com o que foi pedido (nome, quantidade e valor), em vez de deixar
    // só o texto genérico da Compra.
    items?: {
        name: string;
        quantity: string | number;
        unit?: string | null;
        unitPrice?: string | number | null;
        total?: string | number | null;
    }[];
};

function formatItemsSummary(
    items: Purchase['items'],
): string {
    if (!items || items.length === 0) return '';

    return items
        .map((item) => {
            const qty = Number(item.quantity);
            const qtyLabel = Number.isFinite(qty)
                ? qty.toLocaleString('pt-BR', {
                    maximumFractionDigits: 3,
                })
                : item.quantity;
            const unit = item.unit ? ` ${item.unit}` : '';

            const unitPrice =
                item.unitPrice != null
                    ? Number(item.unitPrice)
                    : null;
            const priceLabel =
                unitPrice != null
                    ? ` x R$ ${unitPrice.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}`
                    : '';

            return `${item.name} (${qtyLabel}${unit}${priceLabel})`;
        })
        .join(', ');
}

// Mesma ideia do formatItemsSummary acima, mas uma linha por item (nome,
// quantidade+unidade e valor TOTAL do item, não unitário) — usado pra
// pré-preencher a "Descrição dos produtos" do bloco de Compra sem NF, que
// é um textarea multi-linha.
function formatItemsMultiline(
    items: Purchase['items'],
): string {
    if (!items || items.length === 0) return '';

    return items
        .map((item) => {
            const qty = Number(item.quantity);
            const qtyLabel = Number.isFinite(qty)
                ? qty.toLocaleString('pt-BR', {
                    maximumFractionDigits: 3,
                })
                : item.quantity;
            const unit = item.unit || '';

            const total =
                item.total != null
                    ? Number(item.total)
                    : item.unitPrice != null &&
                      Number.isFinite(qty)
                        ? Number(item.unitPrice) * qty
                        : null;
            const totalLabel =
                total != null
                    ? ` R$ ${total.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}`
                    : '';

            return `${item.name} ${qtyLabel}${unit}${totalLabel}`;
        })
        .join('\n');
}

type BillType =
    | 'BOLETO'
    | 'PIX'
    | 'CARD'
    | 'NO_BILL';

type BillPaymentMethod =
    | 'BANK_SLIP'
    | 'PIX'
    | 'CREDIT_CARD'
    | 'DEBIT_CARD'
    | 'CASH'
    | 'FLASH'
    | 'BANK_TRANSFER'
    | 'COMPANY_ACCOUNT';

type PixKeyType =
    | 'CPF'
    | 'CNPJ'
    | 'EMAIL'
    | 'PHONE'
    | 'RANDOM'
    | 'EVP';

type BillForm = {
    description: string;
    value: string;

    type: BillType;
    paymentMethod: BillPaymentMethod;

    dueDate: string;

    storeId: string;
    supplierId: string;
    purchaseId: string;

    barcode: string;

    pixKey: string;
    pixKeyType: PixKeyType;
    pixQrCode: string;

    bankName: string;
    bankAgency: string;
    bankAccount: string;
    beneficiary: string;

    fileUrl: string;
    notes: string;
};

function createEmptyForm(): BillForm {
    return {
        description: '',
        value: '',

        type: 'BOLETO',
        paymentMethod: 'BANK_SLIP',

        dueDate: '',

        storeId: '',
        supplierId: '',
        purchaseId: '',

        barcode: '',

        pixKey: '',
        pixKeyType: 'CNPJ',
        pixQrCode: '',

        bankName: '',
        bankAgency: '',
        bankAccount: '',
        beneficiary: '',

        fileUrl: '',
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

    return Number.isFinite(parsed)
        ? parsed
        : 0;
}

function formatCurrency(
    value: string | number,
) {
    return Number(value).toLocaleString(
        'pt-BR',
        {
            style: 'currency',
            currency: 'BRL',
        },
    );
}

export default function NewBillPage() {
    return (
        <Suspense
            fallback={
                <AppLayout title="Nova conta">
                    <p className="text-zinc-600 dark:text-zinc-400">
                        Carregando dados da conta...
                    </p>
                </AppLayout>
            }
        >
            <NewBillPageInner />
        </Suspense>
    );
}

function NewBillPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const purchaseIdFromUrl =
        searchParams.get('purchaseId') || '';

    const [form, setForm] =
        useState<BillForm>(
            createEmptyForm(),
        );

    const [purchase, setPurchase] =
        useState<Purchase | null>(null);

    const activeStore = getActiveStore();

    const [suppliers, setSuppliers] =
        useState<Supplier[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [saving, setSaving] =
        useState(false);

    const [uploading, setUploading] =
        useState(false);

    // Evita reprocessar/tocar o toast de novo a cada tecla depois que já
    // lemos um código completo (ex.: usuário continua editando manualmente
    // depois da leitura automática).
    const [lastReadDigits, setLastReadDigits] =
        useState('');

    // Fluxo 2 (compra sem NF e nem vai ter): descrição dos produtos e/ou
    // foto da notinha, exigidos antes de salvar quando a compra vinculada
    // não tem nenhum FiscalDocument (nem INVOICE, nem COUPON).
    const [noInvoiceNote, setNoInvoiceNote] =
        useState('');

    const [couponUploaded, setCouponUploaded] =
        useState(false);

    const [uploadingCoupon, setUploadingCoupon] =
        useState(false);

    const purchaseHasFiscalDocument =
        (purchase?.fiscalDocuments?.length || 0) > 0;

    const purchaseHasExistingNote = Boolean(
        purchase?.noInvoiceProductsNote?.trim(),
    );

    const needsNoInvoiceProof =
        Boolean(purchase) &&
        !purchaseHasFiscalDocument &&
        !purchaseHasExistingNote &&
        !couponUploaded;

    async function uploadCouponForPurchase(file: File) {
        if (!purchase) {
            return;
        }

        const formData = new FormData();

        formData.append('file', file);
        formData.append('type', 'COUPON');

        try {
            setUploadingCoupon(true);

            await api.post(
                `/purchases/${purchase.id}/fiscal-documents/upload`,
                formData,
                {
                    headers: {
                        'Content-Type':
                            'multipart/form-data',
                    },
                },
            );

            setCouponUploaded(true);

            toast.success(
                'Foto da notinha enviada.',
            );
        } catch (error: any) {
            toast.error(
                error?.response?.data
                    ?.message ||
                'Erro ao enviar a foto da notinha.',
            );
        } finally {
            setUploadingCoupon(false);
        }
    }

    function handleBarcodeInput(value: string) {
        setForm((current) => ({
            ...current,
            barcode: value,
        }));

        const digitsOnly = value.replace(/\D/g, '');

        if (digitsOnly === lastReadDigits) {
            return;
        }

        const result = parseBoletoCode(value);

        if (result.status === 'incomplete') {
            return;
        }

        setLastReadDigits(digitsOnly);

        if (result.status === 'unsupported') {
            toast.error(result.message);
            return;
        }

        const { data } = result;

        setForm((current) => ({
            ...current,
            dueDate: data.dueDate || current.dueDate,
            value:
                data.value !== null
                    ? data.value.toFixed(2).replace('.', ',')
                    : current.value,
        }));

        const parts: string[] = [];

        if (data.value !== null) {
            parts.push(formatCurrency(data.value));
        }

        if (data.dueDate) {
            parts.push(
                `vence em ${new Date(
                    `${data.dueDate}T12:00:00.000Z`,
                ).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`,
            );
        }

        if (!data.checkDigitsOk) {
            toast(
                `Boleto lido (${parts.join(' — ') || 'sem valor/vencimento identificado'
                }), mas o dígito verificador não confere — confira os dados antes de salvar.`,
            );
            return;
        }

        toast.success(
            parts.length > 0
                ? `Boleto lido: ${parts.join(' — ')}`
                : 'Código lido, mas sem valor/vencimento identificável (pode ser boleto sem valor definido).',
        );
    }

    useEffect(() => {
        loadInitialData();
    }, [purchaseIdFromUrl]);

    async function loadInitialData() {
        try {
            setLoading(true);

            const suppliersResponse =
                await api.get('/suppliers');

            setSuppliers(
                suppliersResponse.data || [],
            );

            if (purchaseIdFromUrl) {
                const purchaseResponse =
                    await api.get(
                        `/purchases/${purchaseIdFromUrl}`,
                    );

                const loadedPurchase: Purchase =
                    purchaseResponse.data;

                setPurchase(loadedPurchase);

                const itemsSummary = formatItemsSummary(
                    loadedPurchase.items,
                );

                // Se a compra ainda não tem uma nota "sem NF" salva, já
                // deixa a Descrição dos produtos (bloco de Compra sem NF)
                // pré-preenchida com os itens do pedido, um por linha.
                if (!loadedPurchase.noInvoiceProductsNote?.trim()) {
                    const itemsMultiline = formatItemsMultiline(
                        loadedPurchase.items,
                    );

                    if (itemsMultiline) {
                        setNoInvoiceNote(itemsMultiline);
                    }
                }

                setForm({
                    description: itemsSummary
                        ? `${loadedPurchase.description} — ${itemsSummary}`
                        : loadedPurchase.description,

                    value: String(
                        loadedPurchase.value,
                    ),

                    type: 'BOLETO',
                    paymentMethod: 'BANK_SLIP',

                    dueDate:
                        loadedPurchase.dueDate
                            ? loadedPurchase.dueDate.substring(
                                0,
                                10,
                            )
                            : '',

                    storeId:
                        loadedPurchase.store.id,

                    supplierId:
                        loadedPurchase.supplier
                            ?.id || '',

                    purchaseId:
                        loadedPurchase.id,

                    barcode: '',

                    pixKey: '',
                    pixKeyType: 'CNPJ',
                    pixQrCode: '',

                    bankName: '',
                    bankAgency: '',
                    bankAccount: '',
                    beneficiary: '',

                    fileUrl: '',
                    notes: '',
                });

                return;
            }

            setForm((current) => ({
                ...current,
                storeId: activeStore?.id || '',
            }));
        } catch (error: any) {
            const message =
                error?.response?.data
                    ?.message ||
                'Erro ao carregar os dados.';

            toast.error(
                Array.isArray(message)
                    ? message.join(', ')
                    : message,
            );
        } finally {
            setLoading(false);
        }
    }

    const selectedStore = useMemo(
        () => purchase?.store || activeStore || undefined,
        [purchase, activeStore],
    );

    const selectedSupplier = useMemo(
        () =>
            suppliers.find(
                (supplier) =>
                    supplier.id ===
                    form.supplierId,
            ),
        [suppliers, form.supplierId],
    );

    function handleBillTypeChange(
        type: BillType,
    ) {
        let paymentMethod: BillPaymentMethod =
            form.paymentMethod;

        if (type === 'BOLETO') {
            paymentMethod = 'BANK_SLIP';
        }

        if (type === 'PIX') {
            paymentMethod = 'PIX';
        }

        if (type === 'CARD') {
            paymentMethod = 'CREDIT_CARD';
        }

        if (type === 'NO_BILL') {
            paymentMethod = 'BANK_TRANSFER';
        }

        setForm((current) => ({
            ...current,
            type,
            paymentMethod,
        }));
    }

    async function uploadFile(file: File) {
        const formData = new FormData();

        formData.append('file', file);

        try {
            setUploading(true);

            const response = await api.post(
                '/bills/upload',
                formData,
                {
                    headers: {
                        'Content-Type':
                            'multipart/form-data',
                    },
                },
            );

            setForm((current) => ({
                ...current,
                fileUrl:
                    response.data.fileUrl,
            }));

            toast.success(
                'Arquivo enviado.',
            );
        } catch (error: any) {
            toast.error(
                error?.response?.data
                    ?.message ||
                'Erro ao enviar arquivo.',
            );
        } finally {
            setUploading(false);
        }
    }

    async function handleSubmit(
        event: React.FormEvent,
    ) {
        event.preventDefault();

        if (!form.description.trim()) {
            toast.error(
                'Informe a descrição.',
            );
            return;
        }

        if (
            parseDecimal(form.value) <= 0
        ) {
            toast.error(
                'Informe um valor válido.',
            );
            return;
        }

        if (!form.storeId) {
            toast.error(
                'Não foi possível identificar a loja ativa. Saia e entre novamente.',
            );
            return;
        }

        if (!form.dueDate) {
            toast.error(
                'Informe o vencimento.',
            );
            return;
        }

        // Boleto (código de barras / anexo) não é mais obrigatório pra
        // salvar a conta — com ou sem NF. Quem quiser informar, informa
        // agora; senão dá pra completar depois, sem travar o fluxo.

        if (
            form.paymentMethod === 'PIX' &&
            !form.pixKey.trim() &&
            !form.pixQrCode.trim()
        ) {
            toast.error(
                'Informe a chave PIX ou o PIX copia e cola.',
            );
            return;
        }

        if (
            form.paymentMethod ===
            'BANK_TRANSFER' &&
            !form.bankName.trim()
        ) {
            toast.error(
                'Informe o banco da transferência.',
            );
            return;
        }

        if (
            needsNoInvoiceProof &&
            !noInvoiceNote.trim()
        ) {
            toast.error(
                'Essa compra não tem NF nem cupom anexado. Descreva os produtos comprados ou envie a foto da notinha antes de salvar.',
            );
            return;
        }

        try {
            setSaving(true);

            await api.post('/bills', {
                description:
                    form.description.trim(),

                value: parseDecimal(
                    form.value,
                ),

                type: form.type,

                paymentMethod:
                    form.paymentMethod,

                dueDate: form.dueDate,

                storeId: form.storeId,

                supplierId:
                    form.supplierId ||
                    undefined,

                purchaseId:
                    form.purchaseId ||
                    undefined,

                barcode:
                    form.paymentMethod ===
                        'BANK_SLIP'
                        ? form.barcode.trim() ||
                        undefined
                        : undefined,

                pixKey:
                    form.paymentMethod === 'PIX'
                        ? form.pixKey.trim() ||
                        undefined
                        : undefined,

                pixKeyType:
                    form.paymentMethod === 'PIX' &&
                        form.pixKey.trim()
                        ? form.pixKeyType
                        : undefined,

                pixQrCode:
                    form.paymentMethod === 'PIX'
                        ? form.pixQrCode.trim() ||
                        undefined
                        : undefined,

                bankName:
                    form.paymentMethod ===
                        'BANK_TRANSFER'
                        ? form.bankName.trim() ||
                        undefined
                        : undefined,

                bankAgency:
                    form.paymentMethod ===
                        'BANK_TRANSFER'
                        ? form.bankAgency.trim() ||
                        undefined
                        : undefined,

                bankAccount:
                    form.paymentMethod ===
                        'BANK_TRANSFER'
                        ? form.bankAccount.trim() ||
                        undefined
                        : undefined,

                beneficiary:
                    [
                        'PIX',
                        'BANK_TRANSFER',
                    ].includes(
                        form.paymentMethod,
                    )
                        ? form.beneficiary.trim() ||
                        undefined
                        : undefined,

                hasBillFile: Boolean(
                    form.fileUrl,
                ),

                fileUrl:
                    form.fileUrl ||
                    undefined,

                notes:
                    form.notes.trim() ||
                    undefined,

                noInvoiceProductsNote:
                    noInvoiceNote.trim() ||
                    undefined,
            });

            toast.success(
                'Conta a pagar criada.',
            );

            if (form.purchaseId) {
                router.push(
                    `/purchases/${form.purchaseId}`,
                );
                return;
            }

            router.push('/bills');
        } catch (error: any) {
            const message =
                error?.response?.data
                    ?.message ||
                'Erro ao criar conta.';

            toast.error(
                Array.isArray(message)
                    ? message.join(', ')
                    : message,
            );
        } finally {
            setSaving(false);
        }
    }

    function handleCancel() {
        if (form.purchaseId) {
            router.push(
                `/purchases/${form.purchaseId}`,
            );
            return;
        }

        router.push('/bills');
    }

    if (loading) {
        return (
            <AppLayout title="Nova conta">
                <p className="text-zinc-600 dark:text-zinc-400">
                    Carregando dados da
                    conta...
                </p>
            </AppLayout>
        );
    }

    return (
        <AppLayout title="Nova conta a pagar">
            <div className="mx-auto max-w-5xl space-y-5">
                <header>
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="mb-3 inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    >
                        <ArrowLeft size={17} />
                        Voltar
                    </button>

                    <div className="flex items-start gap-3">
                        <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-400">
                            <Wallet size={25} />
                        </div>

                        <div>
                            <h2 className="text-2xl font-bold">
                                Nova conta a pagar
                            </h2>

                            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                Registre boleto,
                                PIX, cartão, dinheiro
                                ou transferência.
                            </p>
                        </div>
                    </div>
                </header>

                {purchase && (
                    <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                        <div className="flex items-start gap-3">
                            <ReceiptText className="mt-1 text-emerald-400" />

                            <div>
                                <p className="text-sm text-emerald-300">
                                    Conta vinculada à
                                    compra
                                </p>

                                <h3 className="mt-1 text-lg font-bold">
                                    {
                                        purchase.description
                                    }
                                </h3>

                                <p className="mt-1 text-sm text-emerald-400/80">
                                    {
                                        purchase.store
                                            .name
                                    }

                                    {purchase.supplier
                                        ?.name
                                        ? ` • ${purchase.supplier.name}`
                                        : ''}
                                </p>

                                <strong className="mt-2 block text-xl text-emerald-400">
                                    {formatCurrency(
                                        purchase.value,
                                    )}
                                </strong>
                            </div>
                        </div>
                    </section>
                )}

                {needsNoInvoiceProof && (
                    <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5">
                        <div className="flex items-start gap-3">
                            <ReceiptText className="mt-1 text-amber-500" />

                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-amber-600 dark:text-amber-400">
                                    Compra sem NF — descrição obrigatória
                                </h3>

                                <p className="mt-1 text-sm text-amber-700/90 dark:text-amber-300/80">
                                    Essa compra não tem NF nem cupom
                                    anexado. Antes de salvar, descreva
                                    os produtos comprados ou envie uma
                                    foto da notinha — isso vai servir
                                    de referência pra depois vincular
                                    ao estoque.
                                </p>

                                <div className="mt-4 space-y-3">
                                    <div>
                                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                            Descrição dos produtos
                                        </label>

                                        <textarea
                                            value={
                                                noInvoiceNote
                                            }
                                            onChange={(event) =>
                                                setNoInvoiceNote(
                                                    event.target.value,
                                                )
                                            }
                                            rows={3}
                                            placeholder="Ex: 2 caixas de refrigerante, 10kg de carne, 1 fardo de água..."
                                            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-500"
                                        />
                                    </div>

                                    <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                                        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                                        ou
                                        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                                    </div>

                                    <div>
                                        <label
                                            className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium ${couponUploaded
                                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                                }`}
                                        >
                                            <Upload size={16} />
                                            {uploadingCoupon
                                                ? 'Enviando...'
                                                : couponUploaded
                                                    ? 'Foto enviada'
                                                    : 'Enviar foto da notinha'}

                                            <input
                                                type="file"
                                                accept="image/*,.pdf"
                                                className="hidden"
                                                disabled={uploadingCoupon}
                                                onChange={(event) => {
                                                    const file =
                                                        event.target
                                                            .files?.[0];

                                                    if (file) {
                                                        uploadCouponForPurchase(
                                                            file,
                                                        );
                                                    }

                                                    event.target.value =
                                                        '';
                                                }}
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                <form
                    onSubmit={handleSubmit}
                    className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
                >
                    <div className="mb-5">
                        <h3 className="text-lg font-bold">
                            Dados da conta
                        </h3>

                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Confira as informações
                            antes de salvar.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Descrição
                            </label>

                            <input
                                data-tour="bill-form-description"
                                value={
                                    form.description
                                }
                                onChange={(event) =>
                                    setForm(
                                        (current) => ({
                                            ...current,
                                            description:
                                                event
                                                    .target
                                                    .value,
                                        }),
                                    )
                                }
                                placeholder="Ex.: Boleto Açougue Central"
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-cyan-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Valor
                            </label>

                            <input
                                data-tour="bill-form-value"
                                value={form.value}
                                onChange={(event) =>
                                    setForm(
                                        (current) => ({
                                            ...current,
                                            value: event
                                                .target
                                                .value,
                                        }),
                                    )
                                }
                                inputMode="decimal"
                                placeholder="0,00"
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-cyan-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Vencimento
                            </label>

                            <input
                                data-tour="bill-form-duedate"
                                type="date"
                                value={form.dueDate}
                                onChange={(event) =>
                                    setForm(
                                        (current) => ({
                                            ...current,
                                            dueDate:
                                                event
                                                    .target
                                                    .value,
                                        }),
                                    )
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-cyan-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Tipo da conta
                            </label>

                            <select
                                data-tour="bill-form-type"
                                value={form.type}
                                onChange={(event) =>
                                    handleBillTypeChange(
                                        event.target
                                            .value as BillType,
                                    )
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-cyan-500"
                            >
                                <option value="BOLETO">
                                    Boleto
                                </option>

                                <option value="PIX">
                                    PIX
                                </option>

                                <option value="CARD">
                                    Cartão
                                </option>

                                <option value="NO_BILL">
                                    Sem boleto
                                </option>
                            </select>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Forma de pagamento
                            </label>

                            <select
                                value={
                                    form.paymentMethod
                                }
                                onChange={(event) =>
                                    setForm(
                                        (current) => ({
                                            ...current,
                                            paymentMethod:
                                                event.target
                                                    .value as BillPaymentMethod,
                                        }),
                                    )
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-cyan-500"
                            >
                                <option value="BANK_SLIP">
                                    Boleto
                                </option>

                                <option value="PIX">
                                    PIX
                                </option>

                                <option value="CREDIT_CARD">
                                    Cartão de crédito
                                </option>

                                <option value="DEBIT_CARD">
                                    Cartão de débito
                                </option>

                                <option value="CASH">
                                    Dinheiro
                                </option>

                                <option value="FLASH">
                                    Flash
                                </option>

                                <option value="BANK_TRANSFER">
                                    Transferência bancária
                                </option>

                                <option value="COMPANY_ACCOUNT">
                                    Conta da empresa
                                </option>
                            </select>
                        </div>

                        {form.paymentMethod ===
                            'BANK_SLIP' && (
                                <div className="md:col-span-2">
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        Código de barras ou
                                        linha digitável
                                    </label>

                                    <textarea
                                        value={
                                            form.barcode
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            handleBarcodeInput(
                                                event.target
                                                    .value,
                                            )
                                        }
                                        onKeyDown={(
                                            event,
                                        ) => {
                                            // Leitoras de código de barras
                                            // funcionam como um teclado e
                                            // costumam mandar Enter no
                                            // final da leitura — evita
                                            // quebrar linha e força a
                                            // conferência do código.
                                            if (
                                                event.key ===
                                                'Enter'
                                            ) {
                                                event.preventDefault();
                                                handleBarcodeInput(
                                                    (
                                                        event.target as HTMLTextAreaElement
                                                    ).value,
                                                );
                                            }
                                        }}
                                        placeholder="Bipe com a leitora ou digite/cole o código do boleto"
                                        className="min-h-24 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 py-3 outline-none focus:border-cyan-500"
                                    />

                                    <p className="mt-2 text-xs text-zinc-500">
                                        Valor e vencimento
                                        são preenchidos
                                        automaticamente ao
                                        bipar ou colar o
                                        código de barras (44
                                        dígitos) ou a linha
                                        digitável (47
                                        dígitos).
                                    </p>
                                </div>
                            )}

                        {form.paymentMethod ===
                            'PIX' && (
                                <>
                                    <div>
                                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                            Tipo da chave
                                            PIX
                                        </label>

                                        <select
                                            value={
                                                form.pixKeyType
                                            }
                                            onChange={(
                                                event,
                                            ) =>
                                                setForm(
                                                    (
                                                        current,
                                                    ) => ({
                                                        ...current,
                                                        pixKeyType:
                                                            event
                                                                .target
                                                                .value as PixKeyType,
                                                    }),
                                                )
                                            }
                                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-cyan-500"
                                        >
                                            <option value="CPF">
                                                CPF
                                            </option>

                                            <option value="CNPJ">
                                                CNPJ
                                            </option>

                                            <option value="EMAIL">
                                                E-mail
                                            </option>

                                            <option value="PHONE">
                                                Telefone
                                            </option>

                                            <option value="RANDOM">
                                                Chave aleatória
                                            </option>

                                            <option value="EVP">
                                                EVP
                                            </option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                            Chave PIX
                                        </label>

                                        <input
                                            value={
                                                form.pixKey
                                            }
                                            onChange={(
                                                event,
                                            ) =>
                                                setForm(
                                                    (
                                                        current,
                                                    ) => ({
                                                        ...current,
                                                        pixKey:
                                                            event
                                                                .target
                                                                .value,
                                                    }),
                                                )
                                            }
                                            placeholder="Informe a chave PIX"
                                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-cyan-500"
                                        />
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                            PIX copia e cola
                                        </label>

                                        <textarea
                                            value={
                                                form.pixQrCode
                                            }
                                            onChange={(
                                                event,
                                            ) =>
                                                setForm(
                                                    (
                                                        current,
                                                    ) => ({
                                                        ...current,
                                                        pixQrCode:
                                                            event
                                                                .target
                                                                .value,
                                                    }),
                                                )
                                            }
                                            placeholder="Cole aqui o código PIX copia e cola, se existir"
                                            className="min-h-24 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 py-3 outline-none focus:border-cyan-500"
                                        />
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                            Favorecido
                                        </label>

                                        <input
                                            value={
                                                form.beneficiary
                                            }
                                            onChange={(
                                                event,
                                            ) =>
                                                setForm(
                                                    (
                                                        current,
                                                    ) => ({
                                                        ...current,
                                                        beneficiary:
                                                            event
                                                                .target
                                                                .value,
                                                    }),
                                                )
                                            }
                                            placeholder="Nome do favorecido"
                                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                </>
                            )}

                        {form.paymentMethod ===
                            'BANK_TRANSFER' && (
                                <>
                                    <div>
                                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                            Banco
                                        </label>

                                        <input
                                            value={
                                                form.bankName
                                            }
                                            onChange={(
                                                event,
                                            ) =>
                                                setForm(
                                                    (
                                                        current,
                                                    ) => ({
                                                        ...current,
                                                        bankName:
                                                            event
                                                                .target
                                                                .value,
                                                    }),
                                                )
                                            }
                                            placeholder="Ex.: Itaú"
                                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-cyan-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                            Agência
                                        </label>

                                        <input
                                            value={
                                                form.bankAgency
                                            }
                                            onChange={(
                                                event,
                                            ) =>
                                                setForm(
                                                    (
                                                        current,
                                                    ) => ({
                                                        ...current,
                                                        bankAgency:
                                                            event
                                                                .target
                                                                .value,
                                                    }),
                                                )
                                            }
                                            placeholder="Número da agência"
                                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-cyan-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                            Conta
                                        </label>

                                        <input
                                            value={
                                                form.bankAccount
                                            }
                                            onChange={(
                                                event,
                                            ) =>
                                                setForm(
                                                    (
                                                        current,
                                                    ) => ({
                                                        ...current,
                                                        bankAccount:
                                                            event
                                                                .target
                                                                .value,
                                                    }),
                                                )
                                            }
                                            placeholder="Número da conta"
                                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-cyan-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                            Favorecido
                                        </label>

                                        <input
                                            value={
                                                form.beneficiary
                                            }
                                            onChange={(
                                                event,
                                            ) =>
                                                setForm(
                                                    (
                                                        current,
                                                    ) => ({
                                                        ...current,
                                                        beneficiary:
                                                            event
                                                                .target
                                                                .value,
                                                    }),
                                                )
                                            }
                                            placeholder="Nome do favorecido"
                                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                </>
                            )}

                        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                            <Building2 size={18} className="text-emerald-400" />
                            <span className="text-sm text-zinc-700 dark:text-zinc-300">
                                Loja
                            </span>
                            <strong className="text-emerald-400">
                                {selectedStore?.name || 'não identificada'}
                            </strong>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Fornecedor
                            </label>

                            <select
                                value={
                                    form.supplierId
                                }
                                onChange={(event) =>
                                    setForm(
                                        (current) => ({
                                            ...current,
                                            supplierId:
                                                event
                                                    .target
                                                    .value,
                                        }),
                                    )
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-cyan-500"
                            >
                                <option value="">
                                    Não informado
                                </option>

                                {suppliers.map(
                                    (supplier) => (
                                        <option
                                            key={
                                                supplier.id
                                            }
                                            value={
                                                supplier.id
                                            }
                                        >
                                            {
                                                supplier.name
                                            }
                                        </option>
                                    ),
                                )}
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Arquivo do boleto ou
                                documento de pagamento
                            </label>

                            <label className="flex min-h-32 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-5 text-center hover:border-cyan-500">
                                <div>
                                    <Upload className="mx-auto mb-3 text-zinc-500" />

                                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                                        {uploading
                                            ? 'Enviando arquivo...'
                                            : form.fileUrl
                                                ? 'Arquivo enviado com sucesso'
                                                : 'Clique para selecionar imagem ou PDF'}
                                    </p>
                                </div>

                                <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    className="hidden"
                                    disabled={
                                        uploading
                                    }
                                    onChange={(
                                        event,
                                    ) => {
                                        const file =
                                            event
                                                .target
                                                .files?.[0];

                                        if (file) {
                                            uploadFile(
                                                file,
                                            );
                                        }

                                        event.target.value =
                                            '';
                                    }}
                                />
                            </label>

                            {form.fileUrl && (
                                <a
                                    href={`${API_URL}${form.fileUrl}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-400 hover:bg-purple-500/20"
                                >
                                    <FileText size={17} />
                                    Abrir arquivo enviado
                                </a>
                            )}
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Observações
                            </label>

                            <textarea
                                value={form.notes}
                                onChange={(event) =>
                                    setForm(
                                        (current) => ({
                                            ...current,
                                            notes: event
                                                .target
                                                .value,
                                        }),
                                    )
                                }
                                placeholder="Informações sobre pagamento, ausência de boleto ou instruções"
                                className="min-h-28 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 py-3 outline-none focus:border-cyan-500"
                            />
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-5 py-3 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        >
                            Cancelar
                        </button>

                        <button
                            data-tour="bill-form-submit"
                            type="submit"
                            disabled={
                                saving ||
                                uploading
                            }
                            className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-zinc-900 dark:text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {saving
                                ? 'Salvando...'
                                : 'Salvar conta'}
                        </button>
                    </div>
                </form>

                {selectedStore && (
                    <p className="text-xs text-zinc-500">
                        Loja selecionada:{' '}
                        {selectedStore.name}

                        {selectedSupplier
                            ? ` • Fornecedor: ${selectedSupplier.name}`
                            : ''}
                    </p>
                )}
            </div>
        </AppLayout>
    );
}