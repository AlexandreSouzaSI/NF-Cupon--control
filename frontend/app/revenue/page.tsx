'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { getActiveStore } from '@/lib/active-store';
import {
    AlertTriangle,
    Calculator,
    ChevronDown,
    ChevronUp,
    LayoutDashboard,
    Loader2,
    Pencil,
    RefreshCw,
    Settings2,
    ShieldAlert,
    Trash2,
    TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

type RevenueEntry = {
    id: string;
    referenceMonth: string;
    grossRevenue: string;
    source: 'MANUAL' | 'IMPORTED_XML';
    notes?: string | null;
    store: { id: string; name: string };
    createdBy: { id: string; name: string };
};

type TaxRegimeConfig = {
    id: string;
    regime: 'SIMPLES' | 'PRESUMIDO' | 'REAL';
    effectiveFrom: string;
    effectiveTo?: string | null;
    simplesAnexo?: string | null;
    presumidoIrpjPercent?: string | null;
    presumidoCsllPercent?: string | null;
    presumidoPisCofinsPercent?: string | null;
    realPisCofinsPercent?: string | null;
    icmsRegimeEspecialMg: boolean;
    icmsAliquotaRefeicao?: string | null;
    icmsAliquotaOutras?: string | null;
    icmsAliquotaPadrao?: string | null;
    notes?: string | null;
};

type CalculationResult = {
    regime: 'SIMPLES' | 'PRESUMIDO' | 'REAL';
    referenceMonth: string;
    monthRevenue: number;
    monthPurchasesCost?: number;
    rbt12?: number;
    total: number;
    simples?: {
        faixa: number;
        aliquotaNominal: number;
        aliquotaEfetiva: number;
        dasValue: number;
        excedeuLimite: boolean;
        limiteFaixaAtual: number;
        faltaParaProximaFaixa: number | null;
        proximaAliquotaNominal: number | null;
    };
    presumido?: {
        baseIrpj: number;
        irpj: number;
        irpjAdicional: number;
        baseCsll: number;
        csll: number;
        pisCofins: number;
        pisCofinsCredito: number;
        icms: number;
        icmsDebito: number;
        icmsAliquotaUsada: number;
        icmsCredito: number;
        icmsTemCredito: boolean;
        majoracaoAplicada: boolean;
    };
    real?: {
        lucroEstimado: number;
        irpj: number;
        irpjAdicional: number;
        csll: number;
        pisCofinsDebito: number;
        pisCofinsCredito: number;
        pisCofins: number;
        icms: number;
        icmsDebito: number;
        icmsAliquotaUsada: number;
        icmsCredito: number;
        icmsTemCredito: boolean;
    };
};

const ALLOWED_ROLES = [
    'ADMINISTRATIVO',
    'PROPRIETARIO',
    'GERENTE',
    'COMPRADOR',
    'FINANCEIRO',
];
const REGIME_LABELS: Record<string, string> = {
    SIMPLES: 'Simples Nacional',
    PRESUMIDO: 'Lucro Presumido',
    REAL: 'Lucro Real',
};

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function todayDate() {
    return new Date().toISOString().slice(0, 10);
}

function formatCurrency(value: string | number | null | undefined) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatPercent(value: number) {
    return `${(value * 100).toFixed(2)}%`;
}

function formatMonth(referenceMonth: string) {
    const [year, month] = referenceMonth.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function formatDate(value?: string | null) {
    if (!value) return 'em aberto';
    return new Date(value).toLocaleDateString('pt-BR');
}

export default function RevenuePage() {
    const user = getUser();
    const allowed = !!user && ALLOWED_ROLES.includes(user.role);

    const [activeTab, setActiveTab] = useState<
        'dashboard' | 'faturamentos' | 'configuracao'
    >('dashboard');

    return (
        <AppLayout title="Tributos">
            <div className="space-y-5">
                <div>
                    <h2 className="text-2xl font-bold">Tributos</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Estimativa gerencial de tributos a partir do faturamento
                        e da configuração do regime — não substitui a apuração
                        oficial do contador.
                    </p>
                </div>

                {!allowed ? (
                    <div className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 text-center">
                        <div className="rounded-2xl bg-red-500/10 p-3 text-red-400">
                            <ShieldAlert size={22} />
                        </div>
                        <p className="font-semibold">Acesso restrito</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Essa página só pode ser vista pelos perfis
                            Administrativo, Proprietário e Financeiro.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                            <button
                                onClick={() => setActiveTab('dashboard')}
                                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${activeTab === 'dashboard'
                                    ? 'bg-purple-600 text-white'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    }`}
                            >
                                <LayoutDashboard size={16} />
                                Dashboard
                            </button>

                            <button
                                onClick={() => setActiveTab('faturamentos')}
                                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${activeTab === 'faturamentos'
                                    ? 'bg-purple-600 text-white'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    }`}
                            >
                                <TrendingUp size={16} />
                                Faturamentos
                            </button>

                            <button
                                onClick={() => setActiveTab('configuracao')}
                                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${activeTab === 'configuracao'
                                    ? 'bg-purple-600 text-white'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    }`}
                            >
                                <Settings2 size={16} />
                                Configuração
                            </button>
                        </div>

                        {activeTab === 'dashboard' && <DashboardTab />}
                        {activeTab === 'faturamentos' && <FaturamentosTab />}
                        {activeTab === 'configuracao' && <ConfiguracaoTab />}
                    </>
                )}
            </div>
        </AppLayout>
    );
}

type Store = { id: string; name: string };

type StoreCalculation =
    | { status: 'loading' }
    | { status: 'ok'; result: CalculationResult }
    | { status: 'error'; message: string };

function DashboardTab() {
    const [stores, setStores] = useState<Store[]>([]);
    const [loadingStores, setLoadingStores] = useState(true);
    const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
    const [referenceMonth, setReferenceMonth] = useState(currentMonth());
    const [calculations, setCalculations] = useState<
        Record<string, StoreCalculation>
    >({});
    const [refreshing, setRefreshing] = useState(false);

    async function loadStores() {
        try {
            setLoadingStores(true);
            const response = await api.get('/stores');
            setStores(response.data);

            if (response.data.length > 0) {
                setSelectedStoreId((current) => current || response.data[0].id);
            }
        } catch {
            toast.error('Erro ao carregar lojas.');
        } finally {
            setLoadingStores(false);
        }
    }

    async function loadCalculations(storeList: Store[], month: string) {
        setRefreshing(true);

        const initialCalc: Record<string, StoreCalculation> = {};
        storeList.forEach((store) => {
            initialCalc[store.id] = { status: 'loading' };
        });
        setCalculations(initialCalc);

        await Promise.all(
            storeList.map(async (store) => {
                try {
                    const response = await api.get('/tax-calculations', {
                        params: { storeId: store.id, referenceMonth: month },
                    });

                    setCalculations((prev) => ({
                        ...prev,
                        [store.id]: { status: 'ok', result: response.data },
                    }));
                } catch (error: any) {
                    const message =
                        error?.response?.data?.message ||
                        'Erro ao calcular o tributo dessa loja.';

                    setCalculations((prev) => ({
                        ...prev,
                        [store.id]: {
                            status: 'error',
                            message: Array.isArray(message)
                                ? message.join(', ')
                                : message,
                        },
                    }));
                }
            }),
        );

        setRefreshing(false);
    }

    useEffect(() => {
        loadStores();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (stores.length > 0) {
            loadCalculations(stores, referenceMonth);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stores, referenceMonth]);

    const okResults = Object.values(calculations).filter(
        (c): c is { status: 'ok'; result: CalculationResult } => c.status === 'ok',
    );
    const totalEstimado = okResults.reduce((sum, c) => sum + c.result.total, 0);
    const pendingCount = Object.values(calculations).filter(
        (c) => c.status === 'error',
    ).length;

    const selectedCalc = selectedStoreId ? calculations[selectedStoreId] : null;
    const selectedStore = stores.find((s) => s.id === selectedStoreId);

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Tributo estimado — todas as lojas
                    </p>
                    <p className="text-3xl font-bold text-purple-400">
                        {formatCurrency(totalEstimado)}
                    </p>
                    {pendingCount > 0 && (
                        <p className="mt-1 flex items-center gap-1 text-sm text-yellow-500">
                            <AlertTriangle size={14} />
                            {pendingCount} loja(s) sem configuração ou
                            faturamento pra esse mês
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <input
                        type="month"
                        value={referenceMonth}
                        onChange={(e) => setReferenceMonth(e.target.value)}
                        className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500"
                    />

                    <button
                        disabled={refreshing || stores.length === 0}
                        onClick={() => loadCalculations(stores, referenceMonth)}
                        className="inline-flex h-11 items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 text-sm font-medium text-purple-400 hover:bg-purple-500/20 disabled:opacity-50"
                    >
                        {refreshing ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <RefreshCw size={16} />
                        )}
                        Atualizar
                    </button>
                </div>
            </div>

            {loadingStores ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Carregando lojas...
                </p>
            ) : stores.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Nenhuma loja disponível.
                </p>
            ) : (
                <>
                    <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                        {stores.map((store) => {
                            const calc = calculations[store.id];
                            const isSelected = store.id === selectedStoreId;

                            return (
                                <button
                                    key={store.id}
                                    onClick={() => setSelectedStoreId(store.id)}
                                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${isSelected
                                        ? 'bg-purple-600 text-white'
                                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                        }`}
                                >
                                    {store.name}
                                    {calc?.status === 'error' && (
                                        <AlertTriangle size={14} className="text-yellow-400" />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {selectedStore && (
                        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-lg font-bold">{selectedStore.name}</h3>
                                {selectedCalc?.status === 'ok' && (
                                    <span className="rounded-full bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-400">
                                        {REGIME_LABELS[selectedCalc.result.regime]}
                                    </span>
                                )}
                            </div>

                            {!selectedCalc || selectedCalc.status === 'loading' ? (
                                <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                                    <Loader2 size={14} className="animate-spin" />
                                    Calculando...
                                </p>
                            ) : selectedCalc.status === 'error' ? (
                                <p className="flex items-start gap-2 text-sm text-yellow-500">
                                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                    {selectedCalc.message}
                                </p>
                            ) : (
                                <div className="space-y-6">
                                    <CalculationBreakdown result={selectedCalc.result} />

                                    {selectedCalc.result.regime === 'SIMPLES' &&
                                        selectedCalc.result.simples && (
                                            <SimplesBracketGauge
                                                simples={selectedCalc.result.simples}
                                                rbt12={selectedCalc.result.rbt12 || 0}
                                            />
                                        )}

                                    <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                                        <h4 className="mb-1 font-semibold">
                                            Como está sendo apurado
                                        </h4>
                                        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                                            Débito, crédito de compras e valor líquido de
                                            cada tributo, no regime atual dessa loja.
                                        </p>

                                        <ApurationChart result={selectedCalc.result} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// Uma linha de apuração: mostra o débito (imposto cheio sobre a receita), o
// quanto disso foi abatido por crédito de compras, e o valor líquido a
// pagar. Quando o tributo não tem direito a crédito nesse regime (PIS/COFINS
// cumulativo do Presumido, ou ICMS no regime especial de MG), a barra de
// crédito simplesmente não aparece e a nota explica o motivo.
function CreditApurationRow({
    label,
    debito,
    credito,
    valor,
    temCredito,
    note,
}: {
    label: string;
    debito: number;
    credito: number;
    valor: number;
    temCredito: boolean;
    note?: string;
}) {
    const base = Math.max(debito, 1);
    const creditoPercent = temCredito
        ? Math.min(100, (Math.min(credito, debito) / base) * 100)
        : 0;
    const valorPercent = Math.min(100, (valor / base) * 100);

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{label}</span>
                <span className="font-semibold text-purple-400">
                    {formatCurrency(valor)}
                </span>
            </div>

            <div className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                    className="absolute inset-y-0 left-0 rounded-full bg-purple-500"
                    style={{ width: `${valorPercent}%` }}
                />
                {temCredito && credito > 0 && (
                    <div
                        className="absolute inset-y-0 rounded-full bg-emerald-500/60"
                        style={{
                            left: `${valorPercent}%`,
                            width: `${creditoPercent}%`,
                        }}
                    />
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 text-xs text-zinc-500">
                <span>Débito (sobre a receita): {formatCurrency(debito)}</span>
                {temCredito ? (
                    <span className="text-emerald-500">
                        Crédito usado (compras): {formatCurrency(credito)}
                    </span>
                ) : (
                    <span>Sem crédito nesse tributo</span>
                )}
            </div>

            {note && <p className="text-xs text-zinc-500">{note}</p>}
        </div>
    );
}

// Mostra como o tributo do regime atual está sendo apurado: quanto é débito
// puro sobre a receita, quanto disso é abatido por crédito das compras do
// mês, e o valor líquido. Cada loja usa seu próprio faturamento/compras, já
// que result vem do cálculo específico daquela loja/mês.
function ApurationChart({ result }: { result: CalculationResult }) {
    if (result.regime === 'SIMPLES' && result.simples) {
        return (
            <div className="space-y-3">
                <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800 p-3 text-sm text-zinc-600 dark:text-zinc-400">
                    <p>
                        DAS = receita do mês ({formatCurrency(result.monthRevenue)})
                        {' × '}
                        alíquota efetiva ({formatPercent(result.simples.aliquotaEfetiva)})
                        {' = '}
                        <span className="font-semibold text-purple-400">
                            {formatCurrency(result.simples.dasValue)}
                        </span>
                    </p>
                </div>
                <p className="text-xs text-zinc-500">
                    O Simples Nacional não tem apuração de crédito por compra — o
                    DAS é sempre calculado sobre a receita bruta, independente do
                    quanto a loja compra no mês.
                </p>
            </div>
        );
    }

    if (result.regime === 'PRESUMIDO' && result.presumido) {
        const p = result.presumido;

        return (
            <div className="space-y-4">
                <CreditApurationRow
                    label={`ICMS (${p.icmsAliquotaUsada}%)`}
                    debito={p.icmsDebito}
                    credito={p.icmsCredito}
                    valor={p.icms}
                    temCredito={p.icmsTemCredito}
                    note={
                        p.icmsTemCredito
                            ? 'Crédito aproximado aplicando a alíquota padrão sobre o custo de compras do mês.'
                            : 'Regime especial de ICMS de MG (alíquota reduzida substitutiva) — não gera crédito.'
                    }
                />

                <CreditApurationRow
                    label="PIS/COFINS (cumulativo)"
                    debito={p.pisCofins}
                    credito={p.pisCofinsCredito}
                    valor={p.pisCofins}
                    temCredito={false}
                    note="No Lucro Presumido o PIS/COFINS é cumulativo — não existe direito a crédito de compras."
                />
            </div>
        );
    }

    if (result.regime === 'REAL' && result.real) {
        const r = result.real;

        return (
            <div className="space-y-4">
                <div className="space-y-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 p-3 text-sm text-zinc-600 dark:text-zinc-400">
                    <div className="flex justify-between">
                        <span>Receita do mês</span>
                        <span>{formatCurrency(result.monthRevenue)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>− Custo de compras do mês</span>
                        <span>{formatCurrency(result.monthPurchasesCost)}</span>
                    </div>
                    <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-700 pt-1 font-semibold text-zinc-800 dark:text-zinc-200">
                        <span>= Lucro estimado (base de IRPJ/CSLL)</span>
                        <span>{formatCurrency(r.lucroEstimado)}</span>
                    </div>
                </div>

                <CreditApurationRow
                    label="PIS/COFINS (não-cumulativo)"
                    debito={r.pisCofinsDebito}
                    credito={r.pisCofinsCredito}
                    valor={r.pisCofins}
                    temCredito
                    note="Crédito aproximado aplicando a mesma alíquota sobre o custo de compras do mês."
                />

                <CreditApurationRow
                    label={`ICMS (${r.icmsAliquotaUsada}%)`}
                    debito={r.icmsDebito}
                    credito={r.icmsCredito}
                    valor={r.icms}
                    temCredito={r.icmsTemCredito}
                    note={
                        r.icmsTemCredito
                            ? 'Crédito aproximado aplicando a alíquota padrão sobre o custo de compras do mês.'
                            : 'Regime especial de ICMS de MG (alíquota reduzida substitutiva) — não gera crédito.'
                    }
                />
            </div>
        );
    }

    return null;
}

// Mostra em que ponto das 6 faixas do Simples a loja está, e quanto falta
// de RBT12 pra cair na próxima faixa (que tem alíquota maior) — a alavanca
// real de planejamento no Simples é não estourar a faixa à toa.
function SimplesBracketGauge({
    simples,
    rbt12,
}: {
    simples: NonNullable<CalculationResult['simples']>;
    rbt12: number;
}) {
    const progresso = simples.excedeuLimite
        ? 100
        : Math.min(100, (rbt12 / simples.limiteFaixaAtual) * 100);

    return (
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <h4 className="mb-1 font-semibold">Posição na faixa do Simples</h4>
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                Faixa {simples.faixa} de 6 — RBT12 atual: {formatCurrency(rbt12)}
            </p>

            <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                    className="h-full rounded-full bg-purple-500"
                    style={{ width: `${progresso}%` }}
                />
            </div>

            {simples.faltaParaProximaFaixa != null &&
                simples.proximaAliquotaNominal != null ? (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    Faltam {formatCurrency(simples.faltaParaProximaFaixa)} de
                    RBT12 pra cair na próxima faixa (alíquota nominal subiria pra{' '}
                    {formatPercent(simples.proximaAliquotaNominal)}).
                </p>
            ) : (
                <p className="mt-2 text-sm text-yellow-500">
                    Última faixa do Simples — RBT12 acima disso sai do limite do
                    regime.
                </p>
            )}
        </div>
    );
}

function FaturamentosTab() {
    const [entries, setEntries] = useState<RevenueEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [form, setForm] = useState({
        referenceMonth: currentMonth(),
        grossRevenue: '',
        notes: '',
    });

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [calculating, setCalculating] = useState<string | null>(null);
    const [results, setResults] = useState<Record<string, CalculationResult>>(
        {},
    );
    const [calcErrors, setCalcErrors] = useState<Record<string, string>>({});

    async function loadEntries() {
        const store = getActiveStore();

        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const response = await api.get('/revenue-entries', {
                params: { storeId: store.id },
            });

            setEntries(response.data);
        } catch {
            toast.error('Erro ao carregar faturamentos.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadEntries();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function resetForm() {
        setForm({ referenceMonth: currentMonth(), grossRevenue: '', notes: '' });
        setEditingId(null);
    }

    function startEdit(entry: RevenueEntry) {
        setEditingId(entry.id);
        setForm({
            referenceMonth: entry.referenceMonth,
            grossRevenue: String(entry.grossRevenue),
            notes: entry.notes || '',
        });
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const store = getActiveStore();

        if (!store) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        if (!form.grossRevenue || Number(form.grossRevenue) <= 0) {
            toast.error('Informe o faturamento bruto do mês.');
            return;
        }

        try {
            setSaving(true);

            if (editingId) {
                await api.put(`/revenue-entries/${editingId}`, {
                    grossRevenue: Number(form.grossRevenue),
                    notes: form.notes || undefined,
                });
                toast.success('Faturamento atualizado.');
            } else {
                await api.post('/revenue-entries', {
                    storeId: store.id,
                    referenceMonth: form.referenceMonth,
                    grossRevenue: Number(form.grossRevenue),
                    notes: form.notes || undefined,
                });
                toast.success('Faturamento lançado.');
            }

            resetForm();
            await loadEntries();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao salvar faturamento.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove(entry: RevenueEntry) {
        const confirmed = confirm(
            `Excluir o faturamento de ${formatMonth(entry.referenceMonth)}?`,
        );

        if (!confirmed) return;

        try {
            await api.delete(`/revenue-entries/${entry.id}`);
            toast.success('Faturamento excluído.');
            await loadEntries();
        } catch {
            toast.error('Erro ao excluir faturamento.');
        }
    }

    async function handleCalculate(entry: RevenueEntry) {
        if (expandedId === entry.id) {
            setExpandedId(null);
            return;
        }

        setExpandedId(entry.id);

        if (results[entry.id] || calcErrors[entry.id]) return;

        try {
            setCalculating(entry.id);

            const response = await api.get('/tax-calculations', {
                params: {
                    storeId: entry.store.id,
                    referenceMonth: entry.referenceMonth,
                },
            });

            setResults({ ...results, [entry.id]: response.data });
            setCalcErrors({ ...calcErrors, [entry.id]: '' });
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao calcular tributo.';

            setCalcErrors({
                ...calcErrors,
                [entry.id]: Array.isArray(message) ? message.join(', ') : message,
            });
        } finally {
            setCalculating(null);
        }
    }

    return (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_1fr]">
            <form
                onSubmit={handleSubmit}
                className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
            >
                <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-2xl bg-purple-500/10 p-3 text-purple-400">
                        <TrendingUp size={22} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">
                            {editingId ? 'Editar faturamento' : 'Novo faturamento'}
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Loja ativa no topo do sistema
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Mês de referência
                        </label>
                        <input
                            type="month"
                            value={form.referenceMonth}
                            disabled={!!editingId}
                            onChange={(e) =>
                                setForm({ ...form, referenceMonth: e.target.value })
                            }
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500 disabled:opacity-50"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Faturamento bruto (R$)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.grossRevenue}
                            onChange={(e) =>
                                setForm({ ...form, grossRevenue: e.target.value })
                            }
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Observações
                        </label>
                        <input
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500"
                        />
                    </div>

                    <div className="flex gap-3">
                        <button
                            disabled={saving}
                            className="h-12 flex-1 rounded-xl bg-purple-500 font-semibold text-white hover:bg-purple-600 disabled:opacity-50"
                        >
                            {saving
                                ? 'Salvando...'
                                : editingId
                                    ? 'Salvar alterações'
                                    : 'Lançar faturamento'}
                        </button>

                        {editingId && (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="h-12 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                Cancelar
                            </button>
                        )}
                    </div>
                </div>
            </form>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold">Faturamentos lançados</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Loja ativa no topo do sistema
                        </p>
                    </div>
                    <TrendingUp className="text-zinc-500" />
                </div>

                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : entries.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhum faturamento lançado ainda pra essa loja.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {entries.map((entry) => {
                            const isExpanded = expandedId === entry.id;
                            const result = results[entry.id];
                            const calcError = calcErrors[entry.id];

                            return (
                                <div
                                    key={entry.id}
                                    className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                                >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="font-semibold capitalize">
                                                {formatMonth(entry.referenceMonth)}
                                            </p>
                                            <p className="text-2xl font-bold text-purple-400">
                                                {formatCurrency(entry.grossRevenue)}
                                            </p>
                                            {entry.notes && (
                                                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                                    {entry.notes}
                                                </p>
                                            )}
                                            <p className="mt-1 text-xs text-zinc-500">
                                                {entry.source === 'MANUAL'
                                                    ? 'Lançado manualmente'
                                                    : 'Importado de XML'}{' '}
                                                por {entry.createdBy.name}
                                            </p>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                onClick={() => handleCalculate(entry)}
                                                className="inline-flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm font-medium text-purple-400 hover:bg-purple-500/20"
                                            >
                                                {calculating === entry.id ? (
                                                    <Loader2 size={16} className="animate-spin" />
                                                ) : (
                                                    <Calculator size={16} />
                                                )}
                                                Calcular
                                                {isExpanded ? (
                                                    <ChevronUp size={14} />
                                                ) : (
                                                    <ChevronDown size={14} />
                                                )}
                                            </button>

                                            <button
                                                onClick={() => startEdit(entry)}
                                                className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                            >
                                                <Pencil size={16} />
                                                Editar
                                            </button>

                                            <button
                                                onClick={() => handleRemove(entry)}
                                                title="Excluir"
                                                className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="mt-4 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                                            {calculating === entry.id ? (
                                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                                    Calculando...
                                                </p>
                                            ) : calcError ? (
                                                <p className="text-sm text-red-400">{calcError}</p>
                                            ) : result ? (
                                                <CalculationBreakdown result={result} />
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}

function CalculationBreakdown({ result }: { result: CalculationResult }) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Regime: {REGIME_LABELS[result.regime]}
                </span>
                <span className="text-xl font-bold text-purple-400">
                    {formatCurrency(result.total)}
                </span>
            </div>

            {result.regime === 'SIMPLES' && result.simples && (
                <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                    <p>
                        RBT12 (receita últimos 12 meses):{' '}
                        {formatCurrency(result.rbt12)}
                    </p>
                    <p>Faixa: {result.simples.faixa}</p>
                    <p>
                        Alíquota nominal:{' '}
                        {formatPercent(result.simples.aliquotaNominal)} — alíquota
                        efetiva: {formatPercent(result.simples.aliquotaEfetiva)}
                    </p>
                    {result.simples.excedeuLimite && (
                        <p className="text-yellow-500">
                            RBT12 acima de R$ 4,8 milhões — fora do limite do
                            Simples Nacional, confirme com o contador.
                        </p>
                    )}
                </div>
            )}

            {result.regime === 'PRESUMIDO' && result.presumido && (
                <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                    <div className="flex justify-between">
                        <span>IRPJ (15% sobre base presumida)</span>
                        <span>{formatCurrency(result.presumido.irpj)}</span>
                    </div>
                    {result.presumido.irpjAdicional > 0 && (
                        <div className="flex justify-between">
                            <span>Adicional de IRPJ (10%)</span>
                            <span>
                                {formatCurrency(result.presumido.irpjAdicional)}
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span>CSLL (9% sobre base presumida)</span>
                        <span>{formatCurrency(result.presumido.csll)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>PIS/COFINS (cumulativo, sem crédito)</span>
                        <span>{formatCurrency(result.presumido.pisCofins)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>
                            ICMS ({result.presumido.icmsAliquotaUsada}%)
                            {result.presumido.icmsTemCredito &&
                                result.presumido.icmsCredito > 0 && (
                                    <span className="text-emerald-500">
                                        {' '}
                                        (débito {formatCurrency(result.presumido.icmsDebito)} −
                                        crédito {formatCurrency(result.presumido.icmsCredito)})
                                    </span>
                                )}
                        </span>
                        <span>{formatCurrency(result.presumido.icms)}</span>
                    </div>
                    {result.presumido.majoracaoAplicada && (
                        <p className="text-yellow-500">
                            Faturamento acima do limite trimestral — aplicada a
                            majoração de 10% na presunção (regra 2026).
                        </p>
                    )}
                </div>
            )}

            {result.regime === 'REAL' && result.real && (
                <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                    <p>
                        Custo de compras no mês:{' '}
                        {formatCurrency(result.monthPurchasesCost)}
                    </p>
                    <p>
                        Lucro estimado (receita − compras):{' '}
                        {formatCurrency(result.real.lucroEstimado)}
                    </p>
                    <div className="flex justify-between">
                        <span>IRPJ (15% sobre o lucro estimado)</span>
                        <span>{formatCurrency(result.real.irpj)}</span>
                    </div>
                    {result.real.irpjAdicional > 0 && (
                        <div className="flex justify-between">
                            <span>Adicional de IRPJ (10%)</span>
                            <span>{formatCurrency(result.real.irpjAdicional)}</span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span>CSLL (9% sobre o lucro estimado)</span>
                        <span>{formatCurrency(result.real.csll)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>
                            PIS/COFINS (não-cumulativo)
                            <span className="text-emerald-500">
                                {' '}
                                (débito {formatCurrency(result.real.pisCofinsDebito)} −
                                crédito {formatCurrency(result.real.pisCofinsCredito)})
                            </span>
                        </span>
                        <span>{formatCurrency(result.real.pisCofins)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>
                            ICMS ({result.real.icmsAliquotaUsada}%)
                            {result.real.icmsTemCredito && result.real.icmsCredito > 0 && (
                                <span className="text-emerald-500">
                                    {' '}
                                    (débito {formatCurrency(result.real.icmsDebito)} −
                                    crédito {formatCurrency(result.real.icmsCredito)})
                                </span>
                            )}
                        </span>
                        <span>{formatCurrency(result.real.icms)}</span>
                    </div>
                    <p className="text-yellow-500">
                        Estimativa aproximada — não considera adições/exclusões
                        do RIR, depreciação, provisões nem prejuízo fiscal
                        acumulado. Não substitui a apuração contábil real.
                    </p>
                </div>
            )}

            <p className="text-xs text-zinc-500">
                Estimativa gerencial — confirme com o contador antes de usar
                pra guiar pagamento.
            </p>
        </div>
    );
}

function ConfiguracaoTab() {
    const [configs, setConfigs] = useState<TaxRegimeConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        regime: 'PRESUMIDO' as 'SIMPLES' | 'PRESUMIDO' | 'REAL',
        effectiveFrom: todayDate(),
        simplesAnexo: 'I',
        presumidoIrpjPercent: '8',
        presumidoCsllPercent: '12',
        presumidoPisCofinsPercent: '3.65',
        realPisCofinsPercent: '9.25',
        icmsRegimeEspecialMg: true,
        icmsAliquotaRefeicao: '3',
        icmsAliquotaOutras: '4',
        icmsAliquotaPadrao: '18',
        notes: '',
    });

    async function loadConfigs() {
        const store = getActiveStore();

        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const response = await api.get('/tax-regime-configs', {
                params: { storeId: store.id },
            });

            setConfigs(response.data);
        } catch {
            toast.error('Erro ao carregar configurações.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadConfigs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const store = getActiveStore();

        if (!store) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        try {
            setSaving(true);

            await api.post('/tax-regime-configs', {
                storeId: store.id,
                regime: form.regime,
                effectiveFrom: form.effectiveFrom,
                simplesAnexo: form.regime === 'SIMPLES' ? form.simplesAnexo : undefined,
                presumidoIrpjPercent:
                    form.regime === 'PRESUMIDO'
                        ? Number(form.presumidoIrpjPercent)
                        : undefined,
                presumidoCsllPercent:
                    form.regime === 'PRESUMIDO'
                        ? Number(form.presumidoCsllPercent)
                        : undefined,
                presumidoPisCofinsPercent:
                    form.regime === 'PRESUMIDO'
                        ? Number(form.presumidoPisCofinsPercent)
                        : undefined,
                realPisCofinsPercent:
                    form.regime === 'REAL'
                        ? Number(form.realPisCofinsPercent)
                        : undefined,
                icmsRegimeEspecialMg:
                    form.regime !== 'SIMPLES' ? form.icmsRegimeEspecialMg : undefined,
                icmsAliquotaRefeicao:
                    form.regime !== 'SIMPLES' && form.icmsRegimeEspecialMg
                        ? Number(form.icmsAliquotaRefeicao)
                        : undefined,
                icmsAliquotaOutras:
                    form.regime !== 'SIMPLES' && form.icmsRegimeEspecialMg
                        ? Number(form.icmsAliquotaOutras)
                        : undefined,
                icmsAliquotaPadrao:
                    form.regime !== 'SIMPLES' && !form.icmsRegimeEspecialMg
                        ? Number(form.icmsAliquotaPadrao)
                        : undefined,
                notes: form.notes || undefined,
            });

            toast.success(
                'Configuração salva. Se havia uma vigente antes, ela foi encerrada automaticamente.',
            );
            await loadConfigs();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao salvar configuração.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove(config: TaxRegimeConfig) {
        const confirmed = confirm(
            `Excluir a configuração de ${REGIME_LABELS[config.regime]} vigente desde ${formatDate(config.effectiveFrom)}?`,
        );

        if (!confirmed) return;

        try {
            await api.delete(`/tax-regime-configs/${config.id}`);
            toast.success('Configuração excluída.');
            await loadConfigs();
        } catch {
            toast.error('Erro ao excluir configuração.');
        }
    }

    return (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
            <form
                onSubmit={handleSubmit}
                className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
            >
                <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-2xl bg-purple-500/10 p-3 text-purple-400">
                        <Settings2 size={22} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">Nova configuração</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Loja ativa no topo do sistema
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Regime tributário
                        </label>
                        <select
                            value={form.regime}
                            onChange={(e) =>
                                setForm({ ...form, regime: e.target.value as any })
                            }
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500"
                        >
                            <option value="SIMPLES">Simples Nacional</option>
                            <option value="PRESUMIDO">Lucro Presumido</option>
                            <option value="REAL">Lucro Real</option>
                        </select>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Vigente a partir de
                        </label>
                        <input
                            type="date"
                            value={form.effectiveFrom}
                            onChange={(e) =>
                                setForm({ ...form, effectiveFrom: e.target.value })
                            }
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500"
                        />
                    </div>

                    {form.regime === 'SIMPLES' && (
                        <p className="rounded-xl bg-zinc-100 dark:bg-zinc-800 p-3 text-sm text-zinc-600 dark:text-zinc-400">
                            Anexo I (comércio) — tabela padrão de restaurantes e
                            bares, já embutida no cálculo do DAS.
                        </p>
                    )}

                    {form.regime === 'PRESUMIDO' && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        Presunção IRPJ (%)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={form.presumidoIrpjPercent}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                presumidoIrpjPercent: e.target.value,
                                            })
                                        }
                                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        Presunção CSLL (%)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={form.presumidoCsllPercent}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                presumidoCsllPercent: e.target.value,
                                            })
                                        }
                                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500"
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-zinc-500">
                                8% comércio / 32% serviço — confirme com o contador
                                qual se aplica à atividade cadastrada dessa loja.
                            </p>

                            <div>
                                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                    PIS/COFINS cumulativo (%)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={form.presumidoPisCofinsPercent}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            presumidoPisCofinsPercent: e.target.value,
                                        })
                                    }
                                    className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500"
                                />
                            </div>
                        </>
                    )}

                    {form.regime === 'REAL' && (
                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                PIS/COFINS não-cumulativo (%)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={form.realPisCofinsPercent}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        realPisCofinsPercent: e.target.value,
                                    })
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500"
                            />
                            <p className="mt-1 text-xs text-zinc-500">
                                Estimativa aproximada (receita − custo de
                                compras) — não substitui a apuração contábil
                                completa. Veja o aviso no resultado do cálculo.
                            </p>
                        </div>
                    )}

                    {form.regime !== 'SIMPLES' && (
                        <>
                            <label className="flex items-center gap-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-3">
                                <input
                                    type="checkbox"
                                    checked={form.icmsRegimeEspecialMg}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            icmsRegimeEspecialMg: e.target.checked,
                                        })
                                    }
                                    className="h-5 w-5"
                                />
                                <span className="text-sm">
                                    Regime especial de ICMS de MG pra bares e
                                    restaurantes (RICMS/MG art. 75, XXXIX)
                                </span>
                            </label>

                            {form.icmsRegimeEspecialMg ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                            ICMS refeições (%)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={form.icmsAliquotaRefeicao}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    icmsAliquotaRefeicao: e.target.value,
                                                })
                                            }
                                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                            ICMS outras (%)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={form.icmsAliquotaOutras}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    icmsAliquotaOutras: e.target.value,
                                                })
                                            }
                                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        ICMS padrão (%)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={form.icmsAliquotaPadrao}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                icmsAliquotaPadrao: e.target.value,
                                            })
                                        }
                                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500"
                                    />
                                </div>
                            )}
                        </>
                    )}

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Observações
                        </label>
                        <input
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-purple-500"
                        />
                    </div>

                    <button
                        disabled={saving}
                        className="h-12 w-full rounded-xl bg-purple-500 font-semibold text-white hover:bg-purple-600 disabled:opacity-50"
                    >
                        {saving ? 'Salvando...' : 'Salvar configuração'}
                    </button>
                </div>
            </form>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold">Histórico de configuração</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Loja ativa no topo do sistema
                        </p>
                    </div>
                    <Settings2 className="text-zinc-500" />
                </div>

                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : configs.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhuma configuração cadastrada ainda pra essa loja.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {configs.map((config) => (
                            <div
                                key={config.id}
                                className="flex flex-col gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div>
                                    <p className="font-semibold">
                                        {REGIME_LABELS[config.regime]}
                                        {!config.effectiveTo && (
                                            <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                                                Vigente
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        {formatDate(config.effectiveFrom)} até{' '}
                                        {formatDate(config.effectiveTo)}
                                    </p>
                                    {config.regime === 'PRESUMIDO' && (
                                        <p className="text-xs text-zinc-500">
                                            IRPJ {config.presumidoIrpjPercent}% • CSLL{' '}
                                            {config.presumidoCsllPercent}% • PIS/COFINS{' '}
                                            {config.presumidoPisCofinsPercent}%
                                            {config.icmsRegimeEspecialMg &&
                                                ` • ICMS ${config.icmsAliquotaRefeicao}%`}
                                        </p>
                                    )}
                                    {config.regime === 'REAL' && (
                                        <p className="text-xs text-zinc-500">
                                            PIS/COFINS {config.realPisCofinsPercent}%
                                            {config.icmsRegimeEspecialMg &&
                                                ` • ICMS ${config.icmsAliquotaRefeicao}%`}
                                        </p>
                                    )}
                                </div>

                                <button
                                    onClick={() => handleRemove(config)}
                                    title="Excluir"
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
