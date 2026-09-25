'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
    AlertTriangle,
    CheckCircle2,
    Link2,
    Loader2,
    Search,
    Wallet,
    X,
} from 'lucide-react';

type NfMatch = {
    id: string;
    chaveAcesso: string;
    nfNumber: string | null;
    issuerCnpj: string | null;
    issuerName: string | null;
    value: number | null;
    issueDate: string | null;
    fileUrl: string | null;
    score: number;
    reasons: string[];
};

type NfMatchModalProps = {
    purchaseId: string;
    purchaseDescription: string;
    // Usados só pra comparar com a NF antes de vincular e avisar se valor
    // ou fornecedor forem diferentes — null quando a compra não tem esse
    // dado (ex: sem fornecedor cadastrado), aí a comparação correspondente
    // é simplesmente pulada.
    purchaseValue?: number | null;
    purchaseSupplierName?: string | null;
    onClose: () => void;
    // Chamado depois de vincular com sucesso, pra tela de trás recarregar a
    // lista de compras (a compra vinculada some do fluxo de "conciliar").
    onLinked: () => void;
};

type PixOrBoleto = 'PIX' | 'BOLETO';

// Formulário que aparece quando o XML da NF não trouxe o vencimento
// (grupo "cobr/dup" ausente) — pede na mão só o essencial: vencimento e se
// vai ser Boleto (código informado depois, quando chegar) ou PIX (chave
// informada já).
type PendingBillForm = {
    matchId: string;
    dueDate: string;
    paymentType: PixOrBoleto;
    pixKey: string;
};

// Confirmação extra antes de vincular quando valor ou fornecedor da NF
// batem diferente do que está na compra — pra não vincular a nota errada
// só porque ficou perto o suficiente na pontuação automática. "intent"
// guarda o que fazer depois que a pessoa confirmar mesmo assim.
type PendingConfirm = {
    matchId: string;
    warnings: string[];
    intent: 'smart' | 'plain';
};

const VALUE_MISMATCH_TOLERANCE = 0.5;

function normalizeName(value: string) {
    return value.trim().toLowerCase();
}

function formatCurrency(value: number | null) {
    if (value === null || value === undefined) return '—';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string | null) {
    if (!value) return '—';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('pt-BR');
}

function formatCnpj(value: string | null) {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 14) return value;
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

// Compara a NF com a compra e devolve avisos legíveis pra cada divergência
// achada — vazio quando não tem nada de estranho (ou não tem como
// comparar, porque falta o dado de um dos lados). Só compara o que dá:
// valor com tolerância pequena (arredondamento de centavos), fornecedor
// por nome normalizado (sem acentuação/caixa não entram na comparação,
// só trim + minúsculas).
function getMismatchWarnings(
    match: NfMatch,
    purchaseValue: number | null | undefined,
    purchaseSupplierName: string | null | undefined,
): string[] {
    const warnings: string[] = [];

    if (
        purchaseValue != null &&
        !isNaN(purchaseValue) &&
        match.value != null &&
        Math.abs(match.value - purchaseValue) > VALUE_MISMATCH_TOLERANCE
    ) {
        warnings.push(
            `Valor diferente: compra ${formatCurrency(purchaseValue)} • NF ${formatCurrency(match.value)}`,
        );
    }

    if (
        purchaseSupplierName &&
        match.issuerName &&
        normalizeName(purchaseSupplierName) !== normalizeName(match.issuerName)
    ) {
        warnings.push(
            `Fornecedor diferente: compra "${purchaseSupplierName}" • NF "${match.issuerName}"`,
        );
    }

    return warnings;
}

// Modal de "Conciliar NF": a partir de uma compra já recebida, busca NF de
// mercadoria pendente que provavelmente é a mesma (por CNPJ do fornecedor,
// valor e nome) e deixa vincular com um clique — ou buscar manualmente por
// número da NF, chave de acesso ou nome do emitente, pro caso das
// sugestões automáticas não acharem (ex: fornecedor sem CNPJ cadastrado).
//
// Ao vincular, primeiro compara valor e fornecedor da NF com os da compra
// — se algum dos dois for diferente, pede confirmação explícita antes de
// seguir (uma sugestão automática pode ter pontuado por outro motivo, tipo
// nome parecido, mesmo sendo a nota errada). Confirmado (ou sem
// divergência nenhuma), tenta gerar a conta a pagar junto: primeiro olha
// se o vencimento está declarado na própria NF (duplicata do XML) — se
// achar, vincula e cria a conta como Boleto pendente (código a informar
// depois) sem precisar de mais nada da pessoa. Se não achar, pede
// vencimento e Boleto/PIX (com chave, se for o caso) antes de confirmar.
export function NfMatchModal({
    purchaseId,
    purchaseDescription,
    purchaseValue,
    purchaseSupplierName,
    onClose,
    onLinked,
}: NfMatchModalProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [matches, setMatches] = useState<NfMatch[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [checkingId, setCheckingId] = useState<string | null>(null);
    const [linkingId, setLinkingId] = useState<string | null>(null);
    const [pendingForm, setPendingForm] = useState<PendingBillForm | null>(null);
    const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

    async function loadMatches(searchTerm?: string) {
        setLoading(true);
        setError(null);

        try {
            const response = await api.get(`/purchases/${purchaseId}/nf-matches`, {
                params: searchTerm ? { search: searchTerm } : undefined,
            });
            setMatches(response.data);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Não foi possível buscar NFs pendentes.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadMatches();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [purchaseId]);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose();
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    async function performLink(
        matchId: string,
        bill?: { dueDate: string; paymentType: PixOrBoleto; pixKey?: string },
    ) {
        setLinkingId(matchId);

        try {
            await api.post(`/purchases/incoming-goods-nf/${matchId}/link`, {
                purchaseId,
                ...(bill
                    ? {
                        generateBill: true,
                        dueDate: bill.dueDate,
                        paymentType: bill.paymentType,
                        pixKey: bill.pixKey || undefined,
                    }
                    : {}),
            });

            toast.success(
                bill
                    ? 'NF vinculada e conta a pagar criada. Agora é só vincular os itens ao estoque.'
                    : 'NF vinculada à compra. Agora é só vincular os itens ao estoque.',
            );

            setPendingForm(null);
            onLinked();
            onClose();

            // Depois de vincular a NF, a mercadoria ainda não virou entrada
            // no estoque — manda direto pra aba "Vincular NF" de Estoque,
            // já com essa NF aberta, em vez de deixar isso pra outra hora.
            router.push(`/estoque?tab=nf&nfId=${matchId}`);
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Erro ao vincular a NF.');
        } finally {
            setLinkingId(null);
        }
    }

    // Núcleo do clique em "Vincular" (depois de qualquer confirmação de
    // divergência já resolvida): pergunta pro backend se o vencimento dá
    // pra achar sozinho na NF. Se der, já vincula e gera a conta direto
    // (Boleto pendente). Se não der, abre o mini-formulário no lugar do
    // botão pra pessoa informar.
    async function proceedSmartLink(match: NfMatch) {
        setCheckingId(match.id);

        try {
            const response = await api.get(
                `/purchases/incoming-goods-nf/${match.id}/suggested-due-date`,
            );

            const dueDate: string | null = response.data?.dueDate || null;

            if (dueDate) {
                await performLink(match.id, { dueDate, paymentType: 'BOLETO' });
            } else {
                setPendingForm({
                    matchId: match.id,
                    dueDate: '',
                    paymentType: 'BOLETO',
                    pixKey: '',
                });
            }
        } catch (err: any) {
            toast.error(
                err?.response?.data?.message ||
                'Não foi possível checar o vencimento da NF.',
            );
        } finally {
            setCheckingId(null);
        }
    }

    // Ponto de entrada dos dois botões de ação (Vincular / Só vincular sem
    // gerar conta) — antes de fazer qualquer coisa, checa se valor ou
    // fornecedor da NF batem diferente do que está na compra. Se bater
    // tudo certo (ou não tiver como comparar), segue direto; se divergir,
    // pede confirmação explícita em vez de vincular ao vivo.
    function requestLink(match: NfMatch, intent: 'smart' | 'plain') {
        const warnings = getMismatchWarnings(match, purchaseValue, purchaseSupplierName);

        if (warnings.length > 0) {
            setPendingConfirm({ matchId: match.id, warnings, intent });
            return;
        }

        if (intent === 'smart') {
            proceedSmartLink(match);
        } else {
            performLink(match.id);
        }
    }

    function handleConfirmMismatch() {
        if (!pendingConfirm) return;

        const match = matches.find((item) => item.id === pendingConfirm.matchId);
        const intent = pendingConfirm.intent;

        setPendingConfirm(null);

        if (!match) return;

        if (intent === 'smart') {
            proceedSmartLink(match);
        } else {
            performLink(match.id);
        }
    }

    function handleConfirmPendingForm() {
        if (!pendingForm) return;

        if (!pendingForm.dueDate) {
            toast.error('Informe a data de vencimento.');
            return;
        }

        if (pendingForm.paymentType === 'PIX' && !pendingForm.pixKey.trim()) {
            toast.error('Informe a chave PIX.');
            return;
        }

        performLink(pendingForm.matchId, {
            dueDate: pendingForm.dueDate,
            paymentType: pendingForm.paymentType,
            pixKey: pendingForm.pixKey.trim() || undefined,
        });
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl">
                <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <div>
                        <h2 className="text-lg font-bold">Conciliar NF</h2>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{purchaseDescription}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            loadMatches(search.trim() || undefined);
                        }}
                        className="flex items-center gap-2"
                    >
                        <div className="relative flex-1">
                            <Search
                                size={16}
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                            />
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Buscar por número da NF, chave de acesso ou nome do emitente"
                                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
                            />
                        </div>
                        <button
                            type="submit"
                            className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            Buscar
                        </button>
                        {search && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearch('');
                                    loadMatches();
                                }}
                                className="text-xs text-zinc-500 hover:underline"
                            >
                                Limpar
                            </button>
                        )}
                    </form>

                    {loading && (
                        <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
                            <Loader2 size={18} className="animate-spin" />
                            Buscando NFs pendentes...
                        </div>
                    )}

                    {!loading && error && (
                        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                            {error}
                        </p>
                    )}

                    {!loading && !error && matches.length === 0 && (
                        <p className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 text-center text-sm text-zinc-500">
                            {search
                                ? 'Nenhuma NF pendente encontrada com esse termo.'
                                : 'Nenhuma sugestão automática. Tente buscar por número da NF, chave de acesso ou nome do emitente acima.'}
                        </p>
                    )}

                    {!loading &&
                        !error &&
                        matches.map((match) => {
                            const isPendingForm =
                                pendingForm?.matchId === match.id;
                            const isPendingConfirm =
                                pendingConfirm?.matchId === match.id;

                            return (
                                <div
                                    key={match.id}
                                    className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-sm">
                                                {match.issuerName || 'Emitente não identificado'}
                                            </p>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                                {formatCnpj(match.issuerCnpj) || 'CNPJ não identificado'}
                                            </p>
                                        </div>

                                        {!isPendingForm && !isPendingConfirm && (
                                            <button
                                                onClick={() => requestLink(match, 'smart')}
                                                disabled={
                                                    checkingId === match.id ||
                                                    linkingId === match.id
                                                }
                                                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/15 px-3 py-2 text-xs font-semibold text-blue-500 hover:bg-blue-500/25 disabled:opacity-60"
                                            >
                                                {checkingId === match.id ||
                                                    linkingId === match.id ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <Link2 size={14} />
                                                )}
                                                Vincular
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                                        <span>NF nº {match.nfNumber || '—'}</span>
                                        <span>Emissão {formatDate(match.issueDate)}</span>
                                        <span className="font-semibold">{formatCurrency(match.value)}</span>
                                    </div>

                                    {match.reasons.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                            {match.reasons.map((reason) => (
                                                <span
                                                    key={reason}
                                                    className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400"
                                                >
                                                    <CheckCircle2 size={11} />
                                                    {reason}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {!isPendingForm && !isPendingConfirm && (
                                        <button
                                            type="button"
                                            onClick={() => requestLink(match, 'plain')}
                                            disabled={
                                                checkingId === match.id ||
                                                linkingId === match.id
                                            }
                                            className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:underline disabled:opacity-60"
                                        >
                                            Só vincular, sem gerar conta a pagar
                                        </button>
                                    )}

                                    {isPendingConfirm && pendingConfirm && (
                                        <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle
                                                    size={16}
                                                    className="mt-0.5 shrink-0 text-amber-500"
                                                />
                                                <div className="space-y-1">
                                                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                                                        Essa NF parece diferente da compra
                                                    </p>
                                                    {pendingConfirm.warnings.map((warning) => (
                                                        <p
                                                            key={warning}
                                                            className="text-xs text-amber-700/90 dark:text-amber-300/90"
                                                        >
                                                            {warning}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleConfirmMismatch}
                                                    disabled={
                                                        checkingId === match.id ||
                                                        linkingId === match.id
                                                    }
                                                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                                                >
                                                    {(checkingId === match.id ||
                                                        linkingId === match.id) && (
                                                            <Loader2 size={16} className="animate-spin" />
                                                        )}
                                                    Vincular mesmo assim
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPendingConfirm(null)}
                                                    className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {isPendingForm && pendingForm && (
                                        <div className="space-y-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
                                            <p className="text-xs text-zinc-600 dark:text-zinc-300">
                                                Não achei o vencimento na NF — informe pra gerar a
                                                conta a pagar junto do vínculo.
                                            </p>

                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <div>
                                                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                                        Vencimento
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={pendingForm.dueDate}
                                                        onChange={(event) =>
                                                            setPendingForm({
                                                                ...pendingForm,
                                                                dueDate: event.target.value,
                                                            })
                                                        }
                                                        className="h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                                        Boleto ou PIX
                                                    </label>
                                                    <div className="flex gap-1 rounded-lg border border-zinc-300 dark:border-zinc-700 p-1 w-fit">
                                                        {(['BOLETO', 'PIX'] as PixOrBoleto[]).map(
                                                            (option) => (
                                                                <button
                                                                    key={option}
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setPendingForm({
                                                                            ...pendingForm,
                                                                            paymentType: option,
                                                                        })
                                                                    }
                                                                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${pendingForm.paymentType === option
                                                                        ? 'bg-blue-500 text-white'
                                                                        : 'text-zinc-600 dark:text-zinc-400'
                                                                        }`}
                                                                >
                                                                    {option === 'BOLETO' ? 'Boleto' : 'PIX'}
                                                                </button>
                                                            ),
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {pendingForm.paymentType === 'BOLETO' && (
                                                <p className="text-[11px] text-zinc-500">
                                                    O código de barras pode ser informado depois, quando
                                                    o boleto chegar — a conta já fica registrada como
                                                    Boleto pendente.
                                                </p>
                                            )}

                                            {pendingForm.paymentType === 'PIX' && (
                                                <div>
                                                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                                        Chave PIX
                                                    </label>
                                                    <input
                                                        value={pendingForm.pixKey}
                                                        onChange={(event) =>
                                                            setPendingForm({
                                                                ...pendingForm,
                                                                pixKey: event.target.value,
                                                            })
                                                        }
                                                        placeholder="Chave PIX"
                                                        className="h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                                                    />
                                                </div>
                                            )}

                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleConfirmPendingForm}
                                                    disabled={linkingId === match.id}
                                                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-500 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60"
                                                >
                                                    {linkingId === match.id && (
                                                        <Loader2 size={16} className="animate-spin" />
                                                    )}
                                                    Confirmar e vincular
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPendingForm(null)}
                                                    className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                </div>

                <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Não achou a NF certa? Você ainda pode aceitar a compra sem nota e gerar a
                        conta a pagar direto.
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            onClose();
                            router.push(`/bills/new?purchaseId=${purchaseId}`);
                        }}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
                    >
                        <Wallet size={16} />
                        Aceitar sem NF
                    </button>
                </div>
            </div>
        </div>
    );
}
