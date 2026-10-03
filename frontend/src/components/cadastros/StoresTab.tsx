'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { canDeleteForever, getUser, hasGlobalStoreAccess } from '@/lib/auth';
import {
    Building2,
    CheckCircle2,
    CreditCard,
    FileSearch,
    Flame,
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
    isDemo?: boolean;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    municipio?: string | null;
    codigoMunicipioIbge?: string | null;
    cep?: string | null;
    inscricaoEstadual?: string | null;
    tipoPessoa?: 'JURIDICA' | 'FISICA';
    cpf?: string | null;
    telefoneAvisoDiario?: string | null;
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

type MeepSyncLog = {
    id: string;
    endpoint: string;
    rangeStart: string;
    rangeEnd: string;
    success: boolean;
    message: string;
    ordersFetched: number;
    transactionsFetched: number;
    createdAt: string;
};

type MeepStatus = {
    hasCredential: boolean;
    meepStoreId: string | null;
    username: string | null;
    active: boolean;
    lastSalesSyncedUntil: string | null;
    lastConciliationSyncedUntil: string | null;
    updatedAt: string | null;
};

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('pt-BR');
}

function formatDateTime(value: string) {
    // Fuso explícito — sem isso o navegador pode exibir o horário UTC
    // cru em vez de converter pra Brasília.
    return new Date(value).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
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

    // Certificado digital: o backend já libera Gerente pra loja(s) dele
    // (ver @Roles em stores.controller.ts e ensureManagedStoreAccess em
    // stores.service.ts) — a lista de lojas que chega aqui pra um Gerente
    // já vem filtrada só pelas dele, então não precisa de checagem extra
    // por loja. Editar dados/excluir continua só pra isAdmin (regra
    // explícita: só Proprietário/Administrativo cadastram e editam loja).
    const canManageCertificate = isAdmin || user?.role === 'GERENTE';
    const podeExcluirDeVez = canDeleteForever(user);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingStore, setEditingStore] = useState<Store | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

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
        isDemo: false,
        tipoPessoa: 'JURIDICA' as 'JURIDICA' | 'FISICA',
        cpf: '',
        telefoneAvisoDiario: '',
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

    // Credencial da API Meep (vendas do bar/restaurante) — mesmo padrão do
    // certificado digital acima, com campos próprios (subscription key,
    // login/senha do portal.meep-app.com, StoreId da Meep).
    const [meepStatus, setMeepStatus] = useState<Record<string, MeepStatus>>(
        {},
    );
    const [meepFormStoreId, setMeepFormStoreId] = useState<string | null>(
        null,
    );
    const [meepForm, setMeepForm] = useState({
        subscriptionKey: '',
        username: '',
        password: '',
        meepStoreId: '',
    });
    const [meepSaving, setMeepSaving] = useState(false);
    const [syncingMeepStoreId, setSyncingMeepStoreId] = useState<
        string | null
    >(null);
    const [meepSyncLogs, setMeepSyncLogs] = useState<
        Record<string, MeepSyncLog[]>
    >({});
    const [meepLogsOpenStoreId, setMeepLogsOpenStoreId] = useState<
        string | null
    >(null);
    const [loadingMeepLogsStoreId, setLoadingMeepLogsStoreId] = useState<
        string | null
    >(null);

    async function loadStores() {
        try {
            setLoading(true);
            const response = await api.get('/stores');
            const loadedStores: Store[] = response.data;
            setStores(loadedStores);

            if (canManageCertificate) {
                await loadCertificateStatuses(loadedStores);
                await loadMeepStatuses(loadedStores);
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

    async function loadMeepStatuses(storeList: Store[]) {
        try {
            const results = await Promise.all(
                storeList.map((store) =>
                    api
                        .get(`/stores/${store.id}/meep-credential`)
                        .then((res) => [store.id, res.data] as const),
                ),
            );

            setMeepStatus(Object.fromEntries(results));
        } catch {
            // Status da credencial Meep é informativo; se falhar, a tela
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

    function openMeepForm(storeId: string) {
        setMeepFormStoreId(storeId);
        setMeepForm({
            subscriptionKey: '',
            username: '',
            password: '',
            meepStoreId: '',
        });
    }

    function closeMeepForm() {
        setMeepFormStoreId(null);
        setMeepForm({
            subscriptionKey: '',
            username: '',
            password: '',
            meepStoreId: '',
        });
    }

    async function handleSaveMeep(storeId: string) {
        if (!meepForm.subscriptionKey.trim()) {
            toast.error('Informe a subscription key da Meep.');
            return;
        }
        if (!meepForm.username.trim()) {
            toast.error('Informe o login do portal.meep-app.com.');
            return;
        }
        if (!meepForm.password.trim()) {
            toast.error('Informe a senha da Meep.');
            return;
        }
        if (!meepForm.meepStoreId.trim()) {
            toast.error('Informe o StoreId da Meep dessa loja.');
            return;
        }

        try {
            setMeepSaving(true);

            await api.post(`/stores/${storeId}/meep-credential`, meepForm);

            toast.success('Credencial Meep salva.');
            closeMeepForm();
            await loadMeepStatuses(stores);
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao salvar a credencial Meep.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setMeepSaving(false);
        }
    }

    async function handleRemoveMeep(store: Store) {
        const confirmed = confirm(
            `Remover a credencial Meep da loja "${store.name}"?`,
        );

        if (!confirmed) return;

        try {
            await api.delete(`/stores/${store.id}/meep-credential`);
            toast.success('Credencial Meep removida.');
            await loadMeepStatuses(stores);
        } catch {
            toast.error('Erro ao remover a credencial Meep.');
        }
    }

    async function handleToggleMeepActive(store: Store) {
        const current = meepStatus[store.id];
        if (!current) return;

        try {
            await api.patch(`/stores/${store.id}/meep-credential/active`, {
                active: !current.active,
            });
            await loadMeepStatuses(stores);
        } catch {
            toast.error('Erro ao atualizar a credencial Meep.');
        }
    }

    async function handleSyncMeepNow(store: Store) {
        try {
            setSyncingMeepStoreId(store.id);

            const response = await api.post(`/meep/${store.id}/sync-now`);
            const result = response.data as {
                success: boolean;
                message?: string;
            };

            if (result.success) {
                toast.success('Sincronização Meep disparada.');
                await loadMeepStatuses(stores);
                // Se o histórico já estava aberto, recarrega pra já mostrar
                // o resultado dessa tentativa (sucesso/erro, quantos
                // pedidos/transações vieram) sem precisar clicar de novo.
                if (meepLogsOpenStoreId === store.id) {
                    await loadMeepSyncLogs(store.id);
                }
            } else {
                toast.error(result.message || 'Não foi possível sincronizar.');
            }
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao sincronizar com a Meep.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setSyncingMeepStoreId(null);
        }
    }

    async function loadMeepSyncLogs(storeId: string) {
        try {
            setLoadingMeepLogsStoreId(storeId);
            const response = await api.get('/meep/sync-logs', {
                params: { storeId },
            });
            setMeepSyncLogs((prev) => ({ ...prev, [storeId]: response.data }));
        } catch {
            toast.error('Erro ao carregar histórico de sincronização Meep.');
        } finally {
            setLoadingMeepLogsStoreId(null);
        }
    }

    async function toggleMeepLogs(store: Store) {
        if (meepLogsOpenStoreId === store.id) {
            setMeepLogsOpenStoreId(null);
            return;
        }

        setMeepLogsOpenStoreId(store.id);
        await loadMeepSyncLogs(store.id);
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
            isDemo: false,
            tipoPessoa: 'JURIDICA',
            cpf: '',
            telefoneAvisoDiario: '',
        });
        setEditingStore(null);
        setShowFiscalFields(false);
    }

    function openNewModal() {
        resetForm();
        setModalOpen(true);
    }

    function closeModal() {
        resetForm();
        setModalOpen(false);
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
            isDemo: !!store.isDemo,
            tipoPessoa: store.tipoPessoa || 'JURIDICA',
            cpf: store.cpf || '',
            telefoneAvisoDiario: store.telefoneAvisoDiario || '',
        });
        setModalOpen(true);
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

            closeModal();
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

    // Exclusão de verdade — só a conta dona do sistema (isAdminMaster) vê
    // esse botão. MUITO destrutivo: apaga em cascata todo o histórico de
    // estoque/compras/NFs/contas dessa loja. Por isso pede confirmação
    // extra (digitar o nome da loja), diferente do "Desativar" normal.
    async function handleRemoveDefinitivo(store: Store) {
        const digitado = prompt(
            `Isso apaga a loja "${store.name}" e TODO o histórico vinculado (estoque, compras, NFs, contas) de vez, sem volta.\n\nPra confirmar, digite o nome exato da loja:`,
        );

        if (digitado === null) return;

        if (digitado.trim() !== store.name) {
            toast.error('Nome digitado não confere — exclusão cancelada.');
            return;
        }

        try {
            setDeletingId(store.id);
            await api.delete(`/stores/${store.id}/definitivo`);
            toast.success('Loja excluída definitivamente.');
            await loadStores();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Erro ao excluir loja.',
            );
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold">Lojas</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Cada loja tem seu próprio fluxo de compras
                    </p>
                </div>

                {isAdmin && (
                    <button
                        onClick={openNewModal}
                        className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-600"
                    >
                        <Building2 size={18} />
                        Nova Loja
                    </button>
                )}
            </div>

            {modalOpen && isAdmin && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) closeModal();
                    }}
                >
                    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl">
                        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-2xl bg-blue-500/10 p-2.5 text-blue-400">
                                    <Building2 size={20} />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold">
                                        {editingStore ? 'Editar loja' : 'Nova loja'}
                                    </h2>
                                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                        Cada loja tem seu próprio fluxo de compras
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-xl p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                <XCircle size={18} />
                            </button>
                        </div>

                        <form
                            onSubmit={handleSubmit}
                            autoComplete="off"
                            className="p-5"
                        >
                            <div className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Nome
                            </label>
                            <input
                                data-tour="store-form-name"
                                value={form.name}
                                onChange={(e) =>
                                    setForm({ ...form, name: e.target.value })
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Tipo
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setForm({ ...form, tipoPessoa: 'JURIDICA' })
                                    }
                                    className={`h-11 rounded-xl border text-sm font-medium ${form.tipoPessoa === 'JURIDICA'
                                        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                        : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                                        }`}
                                >
                                    Loja (CNPJ)
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setForm({ ...form, tipoPessoa: 'FISICA' })
                                    }
                                    className={`h-11 rounded-xl border text-sm font-medium ${form.tipoPessoa === 'FISICA'
                                        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                        : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                                        }`}
                                >
                                    Pessoa Física
                                </button>
                            </div>
                            {form.tipoPessoa === 'FISICA' && (
                                <p className="mt-1 text-xs text-zinc-500">
                                    Pra controlar contas pessoais do proprietário
                                    (não do negócio). Essa loja só vai mostrar
                                    Dashboard e Contas a Pagar no menu.
                                </p>
                            )}
                        </div>

                        {form.tipoPessoa === 'FISICA' && (
                            <>
                                <div>
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        CPF
                                    </label>
                                    <input
                                        value={form.cpf}
                                        onChange={(e) =>
                                            setForm({ ...form, cpf: e.target.value })
                                        }
                                        autoComplete="off"
                                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        Telefone pra aviso diário (WhatsApp)
                                    </label>
                                    <input
                                        value={form.telefoneAvisoDiario}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                telefoneAvisoDiario: e.target.value,
                                            })
                                        }
                                        placeholder="Ex: 31999999999"
                                        autoComplete="off"
                                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-blue-500"
                                    />
                                    <p className="mt-1 text-xs text-zinc-500">
                                        Recebe um WhatsApp todo dia com as
                                        contas que vencem hoje. Deixe em branco
                                        pra não receber.
                                    </p>
                                </div>
                            </>
                        )}

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                CNPJ
                            </label>
                            <input
                                data-tour="store-form-cnpj"
                                value={form.cnpj}
                                onChange={(e) =>
                                    setForm({ ...form, cnpj: e.target.value })
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-blue-500"
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
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-blue-500"
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
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                UF
                            </label>
                            <input
                                data-tour="store-form-uf"
                                value={form.uf}
                                maxLength={2}
                                placeholder="Ex: SP, MG"
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        uf: e.target.value.toUpperCase(),
                                    })
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-blue-500"
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
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
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
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
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
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
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
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
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
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
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
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
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
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
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
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                data-tour="store-form-submit"
                                disabled={saving}
                                className="h-12 flex-1 rounded-xl bg-blue-500 font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                            >
                                {saving
                                    ? 'Salvando...'
                                    : editingStore
                                        ? 'Salvar alterações'
                                        : 'Criar loja'}
                            </button>

                            <button
                                type="button"
                                onClick={closeModal}
                                className="h-12 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                    </form>
                    </div>
                </div>
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
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold">{store.name}</p>

                                            {store.isDemo && (
                                                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                                    Demonstração
                                                </span>
                                            )}

                                            {store.tipoPessoa === 'FISICA' && (
                                                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                                                    Pessoa Física
                                                </span>
                                            )}
                                        </div>

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

                                            {podeExcluirDeVez && (
                                                <button
                                                    onClick={() =>
                                                        handleRemoveDefinitivo(
                                                            store,
                                                        )
                                                    }
                                                    disabled={
                                                        deletingId === store.id
                                                    }
                                                    title="Excluir definitivamente (Admin Master) — apaga tudo, sem volta"
                                                    className="rounded-xl border border-red-700/40 bg-red-700/10 p-2 text-red-700 hover:bg-red-700/20 disabled:opacity-50 dark:text-red-500"
                                                >
                                                    <Flame size={16} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {canManageCertificate && (
                                    <div className="mt-4 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                                        {certStatus[store.id]?.hasCertificate ? (
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex items-center gap-2 text-sm text-blue-500">
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
                                                            : 'border-blue-500/30 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'
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
                                                    className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500 sm:w-48"
                                                />

                                                <div className="flex gap-2">
                                                    <button
                                                        disabled={certSaving}
                                                        onClick={() =>
                                                            handleUploadCertificate(
                                                                store.id,
                                                            )
                                                        }
                                                        className="h-10 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
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
                                                                            className="mt-0.5 shrink-0 text-blue-500"
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

                                {canManageCertificate && (
                                    <div className="mt-4 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                                        {meepStatus[store.id]?.hasCredential ? (
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex items-center gap-2 text-sm text-teal-600 dark:text-teal-400">
                                                    <CreditCard size={16} />
                                                    <span>
                                                        Credencial Meep
                                                        cadastrada
                                                        {meepStatus[store.id]
                                                            ?.meepStoreId &&
                                                            ` (StoreId ${meepStatus[store.id]!.meepStoreId})`}
                                                        {' — '}
                                                        {meepStatus[store.id]
                                                            ?.active
                                                            ? 'ativa'
                                                            : 'desativada'}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        disabled={
                                                            syncingMeepStoreId ===
                                                            store.id
                                                        }
                                                        onClick={() =>
                                                            handleSyncMeepNow(
                                                                store,
                                                            )
                                                        }
                                                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium disabled:cursor-wait ${syncingMeepStoreId ===
                                                            store.id
                                                            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500'
                                                            : 'border-teal-500/30 bg-teal-500/10 text-teal-600 hover:bg-teal-500/20 dark:text-teal-400'
                                                            }`}
                                                    >
                                                        {syncingMeepStoreId ===
                                                            store.id ? (
                                                            <Loader2
                                                                size={14}
                                                                className="animate-spin"
                                                            />
                                                        ) : (
                                                            <Plug size={14} />
                                                        )}
                                                        Buscar agora
                                                    </button>

                                                    <button
                                                        onClick={() =>
                                                            toggleMeepLogs(
                                                                store,
                                                            )
                                                        }
                                                        title="Histórico das últimas tentativas de sincronização (manuais e automáticas)"
                                                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium ${meepLogsOpenStoreId ===
                                                            store.id
                                                            ? 'border-zinc-400 bg-zinc-200 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100'
                                                            : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                                            }`}
                                                    >
                                                        {loadingMeepLogsStoreId ===
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
                                                            handleToggleMeepActive(
                                                                store,
                                                            )
                                                        }
                                                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                    >
                                                        {meepStatus[store.id]
                                                            ?.active
                                                            ? 'Desativar'
                                                            : 'Ativar'}
                                                    </button>

                                                    <button
                                                        onClick={() =>
                                                            openMeepForm(
                                                                store.id,
                                                            )
                                                        }
                                                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                    >
                                                        <KeyRound size={14} />
                                                        Trocar
                                                    </button>

                                                    <button
                                                        onClick={() =>
                                                            handleRemoveMeep(
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
                                                    Nenhuma credencial Meep
                                                    cadastrada (integração de
                                                    vendas do bar/restaurante).
                                                </p>

                                                {meepFormStoreId !== store.id && (
                                                    <button
                                                        onClick={() =>
                                                            openMeepForm(
                                                                store.id,
                                                            )
                                                        }
                                                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                    >
                                                        <CreditCard size={14} />
                                                        Cadastrar credencial Meep
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {meepLogsOpenStoreId === store.id && (
                                            <div className="mt-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
                                                <p className="mb-2 text-xs font-semibold text-zinc-500">
                                                    Últimas tentativas de
                                                    sincronização (manuais e
                                                    automáticas — a automática
                                                    roda sozinha a cada hora,
                                                    respeitando os limites da
                                                    Meep)
                                                </p>

                                                {loadingMeepLogsStoreId ===
                                                    store.id ? (
                                                    <p className="text-sm text-zinc-500">
                                                        Carregando...
                                                    </p>
                                                ) : !meepSyncLogs[store.id] ||
                                                    meepSyncLogs[store.id]
                                                        .length === 0 ? (
                                                    <p className="text-sm text-zinc-500">
                                                        Nenhuma tentativa
                                                        registrada ainda.
                                                    </p>
                                                ) : (
                                                    <div className="max-h-64 space-y-1.5 overflow-y-auto">
                                                        {meepSyncLogs[
                                                            store.id
                                                        ].map((log) => (
                                                            <div
                                                                key={log.id}
                                                                className="flex items-start gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-xs"
                                                            >
                                                                {log.success ? (
                                                                    <CheckCircle2
                                                                        size={
                                                                            14
                                                                        }
                                                                        className="mt-0.5 shrink-0 text-teal-500"
                                                                    />
                                                                ) : (
                                                                    <XCircle
                                                                        size={
                                                                            14
                                                                        }
                                                                        className="mt-0.5 shrink-0 text-red-400"
                                                                    />
                                                                )}
                                                                <div>
                                                                    <p className="font-medium text-zinc-700 dark:text-zinc-300">
                                                                        {
                                                                            log.endpoint
                                                                        }{' '}
                                                                        —{' '}
                                                                        {new Date(
                                                                            log.createdAt,
                                                                        ).toLocaleString(
                                                                            'pt-BR',
                                                                        )}
                                                                    </p>
                                                                    <p className="text-zinc-500">
                                                                        Janela:{' '}
                                                                        {new Date(
                                                                            log.rangeStart,
                                                                        ).toLocaleString(
                                                                            'pt-BR',
                                                                        )}{' '}
                                                                        até{' '}
                                                                        {new Date(
                                                                            log.rangeEnd,
                                                                        ).toLocaleString(
                                                                            'pt-BR',
                                                                        )}
                                                                    </p>
                                                                    <p className="text-zinc-500">
                                                                        {
                                                                            log.message
                                                                        }
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {meepFormStoreId === store.id && (
                                            <div className="mt-3 grid grid-cols-1 gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 sm:grid-cols-2">
                                                <input
                                                    type="text"
                                                    value={
                                                        meepForm.subscriptionKey
                                                    }
                                                    onChange={(e) =>
                                                        setMeepForm((prev) => ({
                                                            ...prev,
                                                            subscriptionKey:
                                                                e.target.value,
                                                        }))
                                                    }
                                                    placeholder="Subscription key"
                                                    className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                                />

                                                <input
                                                    type="text"
                                                    value={meepForm.meepStoreId}
                                                    onChange={(e) =>
                                                        setMeepForm((prev) => ({
                                                            ...prev,
                                                            meepStoreId:
                                                                e.target.value,
                                                        }))
                                                    }
                                                    placeholder="StoreId da Meep"
                                                    className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                                />

                                                <input
                                                    type="text"
                                                    value={meepForm.username}
                                                    onChange={(e) =>
                                                        setMeepForm((prev) => ({
                                                            ...prev,
                                                            username:
                                                                e.target.value,
                                                        }))
                                                    }
                                                    placeholder="Login (portal.meep-app.com)"
                                                    className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                                />

                                                <input
                                                    type="password"
                                                    value={meepForm.password}
                                                    onChange={(e) =>
                                                        setMeepForm((prev) => ({
                                                            ...prev,
                                                            password:
                                                                e.target.value,
                                                        }))
                                                    }
                                                    placeholder="Senha da Meep"
                                                    className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                                />

                                                <div className="flex gap-2 sm:col-span-2">
                                                    <button
                                                        disabled={meepSaving}
                                                        onClick={() =>
                                                            handleSaveMeep(
                                                                store.id,
                                                            )
                                                        }
                                                        className="h-10 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                                                    >
                                                        {meepSaving
                                                            ? 'Enviando...'
                                                            : 'Salvar'}
                                                    </button>

                                                    <button
                                                        onClick={closeMeepForm}
                                                        className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
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
