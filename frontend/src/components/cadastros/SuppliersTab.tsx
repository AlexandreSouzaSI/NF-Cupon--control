'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Pencil, Plus, Tag, Trash2, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import { canDeleteForever, canEditSupplier, getUser } from '@/lib/auth';

type SupplierCategory = {
    id: string;
    name: string;
};

type Store = {
    id: string;
    name: string;
};

type Supplier = {
    id: string;
    name: string;
    cnpj?: string | null;
    phone?: string | null;
    active?: boolean;
    categories?: SupplierCategory[];
    // Vazio = atende todas as lojas (padrão). Só vem preenchido quando o
    // fornecedor foi restringido a lojas específicas.
    stores?: Store[];
};

export function SuppliersTab() {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [categories, setCategories] = useState<SupplierCategory[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    const [name, setName] = useState('');
    const [cnpj, setCnpj] = useState('');
    const [phone, setPhone] = useState('');

    const [newCategoryName, setNewCategoryName] = useState('');
    const [creatingCategory, setCreatingCategory] = useState(false);

    // Categorias sendo editadas por fornecedor — abre um "modo edição"
    // por card em vez de já vir tudo editável (lista pode ficar grande).
    const [editingSupplierId, setEditingSupplierId] = useState<
        string | null
    >(null);
    const [editingCategoryIds, setEditingCategoryIds] = useState<
        Set<string>
    >(new Set());
    // Mesma ideia pras lojas — editado junto com as categorias, no mesmo
    // painel/salvamento (é um PUT só). Vazio = "atende todas as lojas".
    const [editingStoreIds, setEditingStoreIds] = useState<Set<string>>(
        new Set(),
    );
    const [savingCategories, setSavingCategories] = useState(false);

    const user = getUser();
    const podeEditar = canEditSupplier(user);
    const podeExcluirDeVez = canDeleteForever(user);

    // Edição de dados básicos (nome/CNPJ/telefone) — Administrativo e
    // Proprietário, além do Admin Master.
    const [editingInfoId, setEditingInfoId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editCnpj, setEditCnpj] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [savingInfo, setSavingInfo] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

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

    async function loadCategories() {
        try {
            const response = await api.get('/suppliers/categories');
            setCategories(response.data || []);
        } catch {
            toast.error('Erro ao carregar categorias de fornecedor');
        }
    }

    async function loadStores() {
        try {
            const response = await api.get('/stores');
            setStores(response.data || []);
        } catch {
            toast.error('Erro ao carregar lojas');
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

    async function handleCreateCategory(e: React.FormEvent) {
        e.preventDefault();

        if (!newCategoryName.trim()) {
            toast.error('Informe o nome da categoria');
            return;
        }

        try {
            setCreatingCategory(true);

            await api.post('/suppliers/categories', {
                name: newCategoryName,
            });

            toast.success('Categoria criada');
            setNewCategoryName('');
            await loadCategories();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao criar categoria',
            );
        } finally {
            setCreatingCategory(false);
        }
    }

    async function handleRemoveCategory(id: string) {
        if (!confirm('Excluir essa categoria?')) return;

        try {
            await api.delete(`/suppliers/categories/${id}`);
            toast.success('Categoria removida');
            await loadCategories();
            await loadSuppliers();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao remover categoria',
            );
        }
    }

    function startEditingCategories(supplier: Supplier) {
        setEditingSupplierId(supplier.id);
        setEditingCategoryIds(
            new Set((supplier.categories || []).map((c) => c.id)),
        );
        setEditingStoreIds(
            new Set((supplier.stores || []).map((s) => s.id)),
        );
    }

    function toggleEditingCategory(id: string) {
        setEditingCategoryIds((current) => {
            const next = new Set(current);

            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    }

    function toggleEditingStore(id: string) {
        setEditingStoreIds((current) => {
            const next = new Set(current);

            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    }

    async function saveSupplierCategories(supplierId: string) {
        try {
            setSavingCategories(true);

            await api.put(`/suppliers/${supplierId}`, {
                categoryIds: Array.from(editingCategoryIds),
                storeIds: Array.from(editingStoreIds),
            });

            toast.success('Categorias e lojas atualizadas');
            setEditingSupplierId(null);
            await loadSuppliers();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao salvar categorias',
            );
        } finally {
            setSavingCategories(false);
        }
    }

    function startEditingInfo(supplier: Supplier) {
        setEditingInfoId(supplier.id);
        setEditName(supplier.name);
        setEditCnpj(supplier.cnpj || '');
        setEditPhone(supplier.phone || '');
    }

    async function saveSupplierInfo(supplierId: string) {
        if (!editName.trim()) {
            toast.error('Informe o nome do fornecedor');
            return;
        }

        try {
            setSavingInfo(true);

            await api.put(`/suppliers/${supplierId}`, {
                name: editName,
                cnpj: editCnpj || null,
                phone: editPhone || null,
            });

            toast.success('Fornecedor atualizado');
            setEditingInfoId(null);
            await loadSuppliers();
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao salvar fornecedor';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setSavingInfo(false);
        }
    }

    // Exclusão de verdade — só a conta dona do sistema (isAdminMaster) vê
    // esse botão. O backend recusa qualquer outra conta mesmo que a
    // requisição chegue lá (AdminMasterGuard).
    async function handleDeleteForever(supplier: Supplier) {
        if (
            !confirm(
                `Excluir "${supplier.name}" definitivamente? Isso apaga o cadastro de vez, sem volta (diferente de desativar).`,
            )
        ) {
            return;
        }

        try {
            setDeletingId(supplier.id);
            await api.delete(`/suppliers/${supplier.id}`);
            toast.success('Fornecedor excluído definitivamente');
            await loadSuppliers();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao excluir fornecedor',
            );
        } finally {
            setDeletingId(null);
        }
    }

    useEffect(() => {
        loadSuppliers();
        loadCategories();
        loadStores();
    }, []);

    return (
        <div className="space-y-5">
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
                                Telefone (WhatsApp)
                            </label>
                            <input
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="(31) 99999-9999"
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                            <p className="mt-1 text-xs text-zinc-500">
                                Usado pra mandar o link de Cotação.
                            </p>
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
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="font-semibold">{supplier.name}</p>

                                        <div className="flex shrink-0 items-center gap-1">
                                            {podeEditar && (
                                                <button
                                                    type="button"
                                                    onClick={() => startEditingInfo(supplier)}
                                                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-blue-500/10 hover:text-blue-500"
                                                    title="Editar fornecedor"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            )}

                                            {podeExcluirDeVez && (
                                                <button
                                                    type="button"
                                                    disabled={deletingId === supplier.id}
                                                    onClick={() => handleDeleteForever(supplier)}
                                                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                                                    title="Excluir definitivamente (Admin Master)"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {editingInfoId === supplier.id ? (
                                        <div className="mt-3 space-y-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                                            <input
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                placeholder="Nome"
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                            />
                                            <input
                                                value={editCnpj}
                                                onChange={(e) => setEditCnpj(e.target.value)}
                                                placeholder="CNPJ"
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                            />
                                            <input
                                                value={editPhone}
                                                onChange={(e) => setEditPhone(e.target.value)}
                                                placeholder="Telefone (WhatsApp)"
                                                className="h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                            />

                                            <div className="flex justify-end gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingInfoId(null)}
                                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                                >
                                                    Cancelar
                                                </button>

                                                <button
                                                    type="button"
                                                    disabled={savingInfo}
                                                    onClick={() => saveSupplierInfo(supplier.id)}
                                                    className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                                                >
                                                    {savingInfo ? 'Salvando...' : 'Salvar'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                                            <p>CNPJ: {supplier.cnpj || 'Não informado'}</p>
                                            <p>Telefone: {supplier.phone || 'Não informado'}</p>
                                            <p>
                                                Lojas:{' '}
                                                {(supplier.stores || []).length > 0
                                                    ? supplier.stores!
                                                        .map((s) => s.name)
                                                        .join(', ')
                                                    : 'Todas'}
                                            </p>
                                        </div>
                                    )}

                                    {editingSupplierId === supplier.id ? (
                                        <div className="mt-3 space-y-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                                            {categories.length === 0 ? (
                                                <p className="text-xs text-zinc-500">
                                                    Nenhuma categoria criada ainda —
                                                    crie uma abaixo, em Categorias de
                                                    Cotação.
                                                </p>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {categories.map((category) => {
                                                        const checked =
                                                            editingCategoryIds.has(
                                                                category.id,
                                                            );

                                                        return (
                                                            <button
                                                                key={category.id}
                                                                type="button"
                                                                onClick={() =>
                                                                    toggleEditingCategory(
                                                                        category.id,
                                                                    )
                                                                }
                                                                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${checked
                                                                    ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400'
                                                                    : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
                                                                    }`}
                                                            >
                                                                {category.name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            <div className="mt-2 border-t border-zinc-200 dark:border-zinc-800 pt-2">
                                                <p className="mb-2 text-xs font-medium text-zinc-500">
                                                    Atende quais lojas?{' '}
                                                    <span className="font-normal text-zinc-400">
                                                        (opcional — nenhuma
                                                        marcada = atende todas)
                                                    </span>
                                                </p>

                                                <div className="flex flex-wrap gap-2">
                                                    {stores.map((store) => {
                                                        const checked =
                                                            editingStoreIds.has(
                                                                store.id,
                                                            );

                                                        return (
                                                            <button
                                                                key={store.id}
                                                                type="button"
                                                                onClick={() =>
                                                                    toggleEditingStore(
                                                                        store.id,
                                                                    )
                                                                }
                                                                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${checked
                                                                    ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                                                    : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
                                                                    }`}
                                                            >
                                                                {store.name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="flex justify-end gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setEditingSupplierId(null)
                                                    }
                                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                                >
                                                    Cancelar
                                                </button>

                                                <button
                                                    type="button"
                                                    disabled={savingCategories}
                                                    onClick={() =>
                                                        saveSupplierCategories(
                                                            supplier.id,
                                                        )
                                                    }
                                                    className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                                                >
                                                    {savingCategories
                                                        ? 'Salvando...'
                                                        : 'Salvar'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            {(supplier.categories || []).map(
                                                (category) => (
                                                    <span
                                                        key={category.id}
                                                        className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400"
                                                    >
                                                        {category.name}
                                                    </span>
                                                ),
                                            )}

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    startEditingCategories(
                                                        supplier,
                                                    )
                                                }
                                                className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-1 text-xs text-zinc-500 hover:border-green-500 hover:text-green-500"
                                            >
                                                <Tag size={12} />
                                                {(supplier.categories || [])
                                                    .length > 0
                                                    ? 'Editar categorias'
                                                    : 'Definir categorias'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-500">
                        <Tag size={20} />
                    </div>

                    <div>
                        <h2 className="text-lg font-bold">
                            Categorias de Cotação
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Ex: Cervejas, Carnes Bovinas, Estoque seco —
                            decide pra quem cada lista de cotação é
                            mandada.
                        </p>
                    </div>
                </div>

                <form
                    onSubmit={handleCreateCategory}
                    className="mb-4 flex gap-2"
                >
                    <input
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Nome da categoria"
                        className="h-11 flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                    />
                    <button
                        disabled={creatingCategory}
                        className="h-11 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-zinc-900 hover:bg-amber-600 disabled:opacity-50"
                    >
                        {creatingCategory ? 'Criando...' : 'Criar'}
                    </button>
                </form>

                {categories.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhuma categoria criada ainda.
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {categories.map((category) => (
                            <span
                                key={category.id}
                                className="inline-flex items-center gap-2 rounded-full border border-zinc-300 dark:border-zinc-700 py-1 pl-3 pr-1 text-sm text-zinc-700 dark:text-zinc-300"
                            >
                                {category.name}
                                {podeExcluirDeVez && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleRemoveCategory(category.id)
                                        }
                                        className="rounded-full p-1 text-zinc-400 hover:bg-red-500/10 hover:text-red-500"
                                        title="Excluir categoria (Admin Master)"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </span>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
