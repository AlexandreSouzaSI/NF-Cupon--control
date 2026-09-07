'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getUser, hasGlobalStoreAccess } from '@/lib/auth';
import {
    Building2,
    CheckCircle2,
    FileSearch,
    History,
    KeyRound,
    Loader2,
    Pencil,
    Plug,
    ShieldCheck,
    Store as StoreIcon,
    Trash2,
    Upload,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

type Store = {
    id: string;
    name: string;
    cnpj?: string | null;
    address?: string | null;
    phone?: string | null;
    uf?: string | null;
    active: boolean;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    municipio?: string | null;
    codigoMunicipioIbge?: string | null;
    cep?: string | null;
    inscricaoEstadual?: string | null;
};

type CertificateStatus = {
    hasCertificate: boolean;
    fileName: string | null;
    uploadedAt: string | null;
};

type SyncLog = {
    id: string;
    source: 'NFE_COMPRA' | 'NFSE_SERVICO';
    success: boolean;
    message: string;
    fetchedTotal: number;
    createdAt: string;
};

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('pt-BR');
}

function formatDateTime(value: string) {
    return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function sourceLabel(source: SyncLog['source']) {
    return source === 'NFE_COMPRA' ? 'NF-e (mercadoria)' : 'NFS-e (serviço)';
}

export function StoresTab() {
    const user = getUser();
    const isAdmin = !!user && hasGlobalStoreAccess(user.role);

    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingStore, setEditingStore] = useState<Store | null>(null);

    const [form, setForm] = useState({
        name: '',
        cnpj: '',
        address: '',
        phone: '',
        uf: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        municipio: '',
        codigoMunicipioIbge: '',
        cep: '',
        inscricaoEstadual: '',
    });

    const [showFiscalFields, setShowFiscalFields] = useState(false);

    const [certStatus, setCertStatus] = useState<
        Record<string, CertificateStatus>
    >({});
    const [certFormStoreId, setCertFormStoreId] = useState<string | null>(
        null,
    );
    const [certFile, setCertFile] = useState<File | null>(null);
    const [certPassword, setCertPassword] = useState('');
    const [certSaving, setCertSaving] = useState(false);
    const [testingCertStoreId, setTestingCertStoreId] = useState<
        string | null
    >(null);
    const [diagnosingCertStoreId, setDiagnosingCertStoreId] = useState<
        string | null
    >(null);
    const [testingGoodsStoreId, setTestingGoodsStoreId] = useState<
        string | null
    >(null);

    const [syncLogs, setSyncLogs] = useState<Record<string, SyncLog[]>>({});
    const [logsOpenStoreId, setLogsOpenStoreId] = useState<string | null>(
        null,
    );
    const [loadingLogsStoreId, setLoadingLogsStoreId] = useState<
        string | null
    >(null);

    async function loadStores() {
        try {
            setLoading(true);
            const response = await api.get('/stores');
            const loadedStores: Store[] = response.data;
            setStores(loadedStores);

            if (isAdmin) {
                await loadCertificateStatuses(loadedStores);
            }
        } catch {
            toast.error('Erro ao carregar lojas.');
        } finally {
            setLoading(false);
        }
    }

    async function loadCertificateStatuses(storeList: Store[]) {
        try {
            const results = await Promise.all(
                storeList.map((store) =>
                    api
                        .get(`/stores/${store.id}/certificate`)
                        .then((res) => [store.id, res.data] as const),
                ),
            );

            setCertStatus(Object.fromEntries(results));
        } catch {
            // Status do certificado é informativo; se falhar, a tela
            // continua utilizável sem essa informação.
        }
    }

    useEffect(() => {
        loadStores();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function openCertForm(storeId: string) {
        setCertFormStoreId(storeId);
        setCertFile(null);
        setCertPassword('');
    }

    function closeCertForm() {
        setCertFormStoreId(null);
        setCertFile(null);
        setCertPassword('');
    }

    async function handleUploadCertificate(storeId: string) {
        if (!certFile) {
            toast.error('Selecione o arquivo do certificado (.pfx).');
            return;
        }

        if (!certPassword.trim()) {
            toast.error('Informe a senha do certificado.');
            return;
        }

        const formData = new FormData();
        formData.append('file', certFile);
        formData.append('password', certPassword);

        try {
            setCertSaving(true);

            await api.post(
                `/stores/${storeId}/certificate`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                },
            );

            toast.success('Certificado cadastrado.');
            closeCertForm();
            await loadCertificateStatuses(stores);
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao cadastrar certificado.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setCertSaving(false);
        }
    }

    async function handleTestConnection(store: Store) {
        try {
            setTestingCertStoreId(store.id);

            const response = await api.post(
                `/stores/${store.id}/certificate/test-connection`,
            );

            const result = response.data as {
                success: boolean;
                message: string;
            };

            if (result.success) {
                toast.success(result.message);
            } else {
                toast.error(result.message);
            }
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao testar a conexão com a Sefaz.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setTestingCertStoreId(null);
        }
    }

    async function handleTestGoodsConnection(store: Store) {
        try {
            setTestingGoodsStoreId(store.id);

            const response = await api.post(
                `/stores/${store.id}/certificate/test-goods-connection`,
            );

            const result = response.data as {
                success: boolean;
                message: string;
            };

            if (result.success) {
                toast.success(result.message);
            } else {
                toast.error(result.message);
            }
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao testar a conexão de NF-e de mercadoria.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setTestingGoodsStoreId(null);
        }
    }

    async function handleRunDiagnostics(store: Store) {
        try {
            setDiagnosingCertStoreId(store.id);

            const response = await api.post(
                `/stores/${store.id}/certificate/diagnostics`,
            );

            const okCount = (response.data?.attempts || []).filter(
                (attempt: any) =>
                    attempt.status && attempt.status < 400,
            ).length;

            // eslint-disable-next-line no-console
            console.log(
                `[diagnóstico Sefaz - ${store.name}]`,
                response.data,
            );

            toast.success(
                `Diagnóstico concluído (${okCount} endereço(s) responderam OK). Abra o Console (F12) e me envie o que apareceu lá.`,
            );
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao rodar o diagnóstico.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setDiagnosingCertStoreId(null);
        }
    }

    async function toggleLogs(store: Store) {
        if (logsOpenStoreId === store.id) {
            setLogsOpenStoreId(null);
            return;
        }

        setLogsOpenStoreId(store.id);

        try {
            setLoadingLogsStoreId(store.id);

            const response = await api.get(
                `/stores/${store.id}/sefaz-sync-logs`,
            );

            setSyncLogs((prev) => ({ ...prev, [store.id]: response.data }));
        } catch {
            toast.error('Erro ao carregar histórico de busca.');
        } finally {
            setLoadingLogsStoreId(null);
        }
    }

    async function handleRemoveCertificate(store: Store) {
        const confirmed = confirm(
            `Remover o certificado digital da loja "${store.name}"?`,
        );

        if (!confirmed) return;

        try {
            await api.delete(`/stores/${store.id}/certificate`);
            toast.success('Certificado removido.');
            await loadCertificateStatuses(stores);
        } catch {
            toast.error('Erro ao remover certificado.');
        }
    }

    function resetForm() {
        setForm({
            name: '',
            cnpj: '',
            address: '',
            phone: '',
            uf: '',
            logradouro: '',
            numero: '',
            complemento: '',
            bairro: '',
            municipio: '',
            codigoMunicipioIbge: '',
            cep: '',
            inscricaoEstadual: '',
        });
        setEditingStore(null);
        setShowFiscalFields(false);
    }

    function startEdit(store: Store) {
        setEditingStore(store);
        setForm({
            name: store.name || '',
            cnpj: store.cnpj || '',
            address: store.address || '',
            phone: store.phone || '',
            uf: store.uf || '',
            logradouro: store.logradouro || '',
            numero: store.numero || '',
            complemento: store.complemento || '',
            bairro: store.bairro || '',
            municipio: store.municipio || '',
            codigoMunicipioIbge: store.codigoMunicipioIbge || '',
            cep: store.cep || '',
            inscricaoEstadual: store.inscricaoEstadual || '',
        });
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (!form.name.trim()) {
            toast.error('Informe o nome da loja.');
            return;
        }

        try {
            setSaving(true);

            if (editingStore) {
                await api.put(`/stores/${editingStore.id}`, form);
                toast.success('Loja atualizada.');
            } else {
                await api.post('/stores', form);
                toast.success('Loja cadastrada.');
            }

            resetForm();
            await loadStores();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao salvar loja.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove(store: Store) {
        const confirmed = confirm(`Desativar a loja "${store.name}"?`);

        if (!confirmed) return;

        try {
            await api.delete(`/stores/${store.id}`);
            toast.success('Loja desativada.');
            await loadStores();
        } catch {
            toast.error('Erro ao desativar loja.');
        }
    }

    return (
        <div
            className={`grid grid-cols-1 gap-5 ${isAdmin ? 'xl:grid-cols-[420px_1fr]' : ''
                }`}
        >
            {isAdmin && (
                <form
                    onSubmit={handleSubmit}
                    autoComplete="off"
                    className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
                >
                    <div className="mb-5 flex items-center gap-3">
                        <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                            <Building2 size={22} />
                        </div>

                        <div>
                            <h2 className="text-lg font-bold">
                                {editingStore ? 'Editar loja' : 'Nova loja'}
                            </h2>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                Cada loja tem seu próprio fluxo de compras
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Nome
                            </label>
                            <input
                                value={form.name}
                                onChange={(e) =>
                                    setForm({ ...form, name: e.target.value })
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                CNPJ
                            </label>
                            <input
                                value={form.cnpj}
                                onChange={(e) =>
                                    setForm({ ...form, cnpj: e.target.value })
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Endereço
                            </label>
                            <input
                                value={form.address}
                                onChange={(e) =>
                                    setForm({ ...form, address: e.target.value })
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Telefone
                            </label>
                            <input
                                value={form.phone}
                                onChange={(e) =>
                                    setForm({ ...form, phone: e.target.value })
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                UF
                            </label>
                            <input
                                value={form.uf}
                                maxLength={2}
                                placeholder="Ex: SP, MG"
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        uf: e.target.value.toUpperCase(),
                                    })
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                            <p className="mt-1 text-xs text-zinc-500">
                                Necessário pra buscar as NF-e de mercadoria
                                automaticamente na Sefaz.
                            </p>
                        </div>

                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                            <button
                                type="button"
                                onClick={() => setShowFiscalFields((v) => !v)}
                                className="flex w-full items-center justify-between text-left text-sm font-medium text-zinc-700 dark:text-zinc-300"
                            >
                                Dados fiscais (pra emitir NF-e própria)
                                <span className="text-xs text-zinc-500">
                                    {showFiscalFields ? 'Ocultar' : 'Mostrar'}
                                </span>
                            </button>

                            {showFiscalFields && (
                                <div
                                    key={editingStore?.id || 'new'}
                                    className="mt-3 space-y-3"
                                >
                                    <p className="text-xs text-zinc-500">
                                        Endereço estruturado + Inscrição Estadual —
                                        só usados pra montar a NF de Perda (baixa
                                        de estoque). Não precisa preencher se a
                                        loja não for emitir essa nota.
                                    </p>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="col-span-2">
                                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                                Logradouro
                                            </label>
                                            <input
                                                value={form.logradouro}
                                                onChange={(e) =>
                                                    setForm({ ...form, logradouro: e.target.value })
                                                }
                                                autoComplete="off"
                                                name="loss-nfe-logradouro"
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                                Número
                                            </label>
                                            <input
                                                value={form.numero}
                                                onChange={(e) =>
                                                    setForm({ ...form, numero: e.target.value })
                                                }
                                                autoComplete="off"
                                                name="loss-nfe-numero"
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                                Complemento
                                            </label>
                                            <input
                                                value={form.complemento}
                                                onChange={(e) =>
                                                    setForm({ ...form, complemento: e.target.value })
                                                }
                                                autoComplete="off"
                                                name="loss-nfe-complemento"
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                                            />
                                        </div>

                                        <div className="col-span-2">
                                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                                Bairro
                                            </label>
                                            <input
                                                value={form.bairro}
                                                onChange={(e) =>
                                                    setForm({ ...form, bairro: e.target.value })
                                                }
                                                autoComplete="off"
                                                name="loss-nfe-bairro"
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                                Município
                                            </label>
                                            <input
                                                value={form.municipio}
                                                onChange={(e) =>
                                                    setForm({ ...form, municipio: e.target.value })
                                                }
                                                autoComplete="off"
                                                name="loss-nfe-municipio"
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                                Código IBGE do município
                                            </label>
                                            <input
                                                value={form.codigoMunicipioIbge}
                                                onChange={(e) =>
                                                    setForm({
                                                        ...form,
                                                        codigoMunicipioIbge: e.target.value,
                                                    })
                                                }
                                                placeholder="Ex: 3106200"
                                                autoComplete="off"
                                                name="loss-nfe-codigo-ibge"
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                                CEP
                                            </label>
                                            <input
                                                value={form.cep}
                                                onChange={(e) =>
                                                    setForm({ ...form, cep: e.target.value })
                                                }
                                                autoComplete="off"
                                                name="loss-nfe-cep"
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                                Inscrição Estadual
                                            </label>
                                            <input
                                                value={form.inscricaoEstadual}
                                                onChange={(e) =>
                                                    setForm({
                                                        ...form,
                                                        inscricaoEstadual: e.target.value,
                                                    })
                                                }
                                                placeholder="Ou deixe em branco se isento"
                                                autoComplete="off"
                                                name="loss-nfe-ie"
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                disabled={saving}
                                className="h-12 flex-1 rounded-xl bg-green-500 font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                            >
                                {saving
                                    ? 'Salvando...'
                                    : editingStore
                                        ? 'Salvar alterações'
                                        : 'Criar loja'}
                            </button>

                            {editingStore && (
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
            )}

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold">Lojas cadastradas</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Estabelecimentos ativos no sistema
                        </p>
                    </div>

                    <StoreIcon className="text-zinc-500" />
                </div>

                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : stores.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhuma loja encontrada.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {stores.map((store) => (
                            <div
                                key={store.id}
                                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                            >
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="font-semibold">{store.name}</p>

                                        <div className="mt-1 space-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                                            <p>CNPJ: {store.cnpj || 'Não informado'}</p>
                                            <p>
                                                Endereço: {store.address || 'Não informado'}
                                            </p>
                                            <p>
                                                Telefone: {store.phone || 'Não informado'}
                                            </p>
                                            <p>UF: {store.uf || 'Não informado'}</p>
                                        </div>
                                    </div>

                                    {isAdmin && (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => startEdit(store)}
                                                className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                            >
                                                <Pencil size={16} />
                                                Editar
                                            </button>

                                            <button
                                                onClick={() => handleRemove(store)}
                                                title="Desativar loja"
                                                className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {isAdmin && (
                                    <div className="mt-4 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                                        {certStatus[store.id]?.hasCertificate ? (
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex items-center gap-2 text-sm text-emerald-500">
                                                    <ShieldCheck size={16} />
                                                    <span>
                                                        Certificado cadastrado
                                                        {certStatus[store.id]
                                                            ?.uploadedAt &&
                                                            ` em ${formatDate(
                                                                certStatus[store.id]!
                                                                    .uploadedAt as string,
                                                            )}`}
                                                        {certStatus[store.id]
                                                            ?.fileName &&
                                                            ` (${certStatus[store.id]!.fileName})`}
                                                    </span>
                                                </div>

                                                <div className="flex gap-2">
                                                    <button
                                                        disabled={
                                                            testingCertStoreId ===
                                                            store.id
                                                        }
                                                        onClick={() =>
                                                            handleTestConnection(
                                                                store,
                                                            )
                                                        }
                                                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium disabled:cursor-wait ${testingCertStoreId ===
                                                            store.id
                                                            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500'
                                                            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                                                            }`}
                                                    >
                                                        {testingCertStoreId ===
                                                            store.id ? (
                                                            <Loader2
                                                                size={14}
                                                                className="animate-spin"
                                                            />
                                                        ) : (
                                                            <Plug size={14} />
                                                        )}
                                                        {testingCertStoreId ===
                                                            store.id
                                                            ? 'Testando... (pode levar até 15s)'
                                                            : 'Testar conexão'}
                                                    </button>

                                                    <button
                                                        disabled={
                                                            testingGoodsStoreId ===
                                                            store.id
                                                        }
                                                        onClick={() =>
                                                            handleTestGoodsConnection(
                                                                store,
                                                            )
                                                        }
                                                        title="Testa a conexão com o webservice de NF-e de mercadoria (produção)"
                                                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium disabled:cursor-wait ${testingGoodsStoreId ===
                                                            store.id
                                                            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500'
                                                            : 'border-purple-500/30 bg-purple-500/10 text-purple-500 hover:bg-purple-500/20'
                                                            }`}
                                                    >
                                                        {testingGoodsStoreId ===
                                                            store.id ? (
                                                            <Loader2
                                                                size={14}
                                                                className="animate-spin"
                                                            />
                                                        ) : (
                                                            <FileSearch size={14} />
                                                        )}
                                                        {testingGoodsStoreId ===
                                                            store.id
                                                            ? 'Testando...'
                                                            : 'Testar NF-e'}
                                                    </button>

                                                    <button
                                                        disabled={
                                                            diagnosingCertStoreId ===
                                                            store.id
                                                        }
                                                        onClick={() =>
                                                            handleRunDiagnostics(
                                                                store,
                                                            )
                                                        }
                                                        title="Ferramenta temporária pra descobrir o endereço certo da API da Sefaz"
                                                        className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-500 hover:bg-blue-500/20 disabled:opacity-50"
                                                    >
                                                        {diagnosingCertStoreId ===
                                                            store.id ? (
                                                            <Loader2
                                                                size={14}
                                                                className="animate-spin"
                                                            />
                                                        ) : null}
                                                        Diagnóstico
                                                    </button>

                                                    <button
                                                        onClick={() =>
                                                            toggleLogs(store)
                                                        }
                                                        title="Histórico das últimas tentativas de busca (manuais e automáticas)"
                                                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${logsOpenStoreId === store.id
                                                            ? 'border-zinc-400 bg-zinc-200 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100'
                                                            : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                                            }`}
                                                    >
                                                        {loadingLogsStoreId ===
                                                            store.id ? (
                                                            <Loader2
                                                                size={14}
                                                                className="animate-spin"
                                                            />
                                                        ) : (
                                                            <History size={14} />
                                                        )}
                                                        Histórico
                                                    </button>

                                                    <button
                                                        onClick={() =>
                                                            openCertForm(store.id)
                                                        }
                                                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                    >
                                                        <KeyRound size={14} />
                                                        Trocar
                                                    </button>

                                                    <button
                                                        onClick={() =>
                                                            handleRemoveCertificate(
                                                                store,
                                                            )
                                                        }
                                                        className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20"
                                                    >
                                                        Remover
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <p className="text-sm text-zinc-500">
                                                    Nenhum certificado digital
                                                    cadastrado.
                                                </p>

                                                {certFormStoreId !== store.id && (
                                                    <button
                                                        onClick={() =>
                                                            openCertForm(store.id)
                                                        }
                                                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                    >
                                                        <Upload size={14} />
                                                        Cadastrar certificado
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {certFormStoreId === store.id && (
                                            <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 sm:flex-row sm:items-center">
                                                <input
                                                    type="file"
                                                    accept=".pfx,.p12"
                                                    onChange={(e) =>
                                                        setCertFile(
                                                            e.target.files?.[0] ||
                                                            null,
                                                        )
                                                    }
                                                    className="flex-1 text-sm text-zinc-600 dark:text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm"
                                                />

                                                <input
                                                    type="password"
                                                    value={certPassword}
                                                    onChange={(e) =>
                                                        setCertPassword(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="Senha do certificado"
                                                    className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500 sm:w-48"
                                                />

                                                <div className="flex gap-2">
                                                    <button
                                                        disabled={certSaving}
                                                        onClick={() =>
                                                            handleUploadCertificate(
                                                                store.id,
                                                            )
                                                        }
                                                        className="h-10 rounded-xl bg-green-500 px-4 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                                                    >
                                                        {certSaving
                                                            ? 'Enviando...'
                                                            : 'Salvar'}
                                                    </button>

                                                    <button
                                                        onClick={closeCertForm}
                                                        className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {logsOpenStoreId === store.id && (
                                            <div className="mt-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
                                                <p className="mb-2 text-xs font-semibold text-zinc-500">
                                                    Últimas tentativas de busca
                                                    (manuais e automáticas — a
                                                    automática roda sozinha a
                                                    cada ~10min, respeitando o
                                                    tempo de espera da Sefaz)
                                                </p>

                                                {loadingLogsStoreId ===
                                                    store.id ? (
                                                    <p className="text-sm text-zinc-500">
                                                        Carregando...
                                                    </p>
                                                ) : !syncLogs[store.id] ||
                                                    syncLogs[store.id].length ===
                                                    0 ? (
                                                    <p className="text-sm text-zinc-500">
                                                        Nenhuma tentativa
                                                        registrada ainda.
                                                    </p>
                                                ) : (
                                                    <div className="max-h-64 space-y-1.5 overflow-y-auto">
                                                        {syncLogs[store.id].map(
                                                            (log) => (
                                                                <div
                                                                    key={log.id}
                                                                    className="flex items-start gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-xs"
                                                                >
                                                                    {log.success ? (
                                                                        <CheckCircle2
                                                                            size={14}
                                                                            className="mt-0.5 shrink-0 text-emerald-500"
                                                                        />
                                                                    ) : (
                                                                        <XCircle
                                                                            size={14}
                                                                            className="mt-0.5 shrink-0 text-red-400"
                                                                        />
                                                                    )}

                                                                    <div className="min-w-0">
                                                                        <p className="text-zinc-700 dark:text-zinc-300">
                                                                            <span className="font-medium">
                                                                                {formatDateTime(
                                                                                    log.createdAt,
                                                                                )}
                                                                            </span>{' '}
                                                                            ·{' '}
                                                                            {sourceLabel(
                                                                                log.source,
                                                                            )}
                                                                        </p>
                                                                        <p className="text-zinc-500 dark:text-zinc-400">
                                                                            {
                                                                                log.message
                                                                            }
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            ),
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
