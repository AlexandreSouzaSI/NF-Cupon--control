'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getUser, hasGlobalStoreAccess } from '@/lib/auth';
import {
    Building2,
    FileSearch,
    KeyRound,
    Loader2,
    Pencil,
    Plug,
    ShieldCheck,
    Store as StoreIcon,
    Trash2,
    Upload,
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
};

type CertificateStatus = {
    hasCertificate: boolean;
    fileName: string | null;
    uploadedAt: string | null;
};

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('pt-BR');
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
    });

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
        setForm({ name: '', cnpj: '', address: '', phone: '', uf: '' });
        setEditingStore(null);
    }

    function startEdit(store: Store) {
        setEditingStore(store);
        setForm({
            name: store.name || '',
            cnpj: store.cnpj || '',
            address: store.address || '',
            phone: store.phone || '',
            uf: store.uf || '',
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
