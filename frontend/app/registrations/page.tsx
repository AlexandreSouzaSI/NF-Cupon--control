'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import {
    Building2,
    CreditCard,
    Plus,
    Trash2,
    Truck,
    Users,
} from 'lucide-react';
import { toast } from 'sonner';

type Store = {
    id: string;
    name: string;
    cards?: Card[];
};

type Card = {
    id: string;
    name: string;
    lastDigits?: string | null;
    holderName?: string | null;
    store: {
        id: string;
        name: string;
    };
};

type Supplier = {
    id: string;
    name: string;
    cnpj?: string | null;
    phone?: string | null;
};

type User = {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'APPROVER' | 'BUYER' | 'FINANCE';

    userStores?: {
        store: {
            id: string;
            name: string;
        };
    }[];
};

export default function RegistrationsPage() {
    const [stores, setStores] = useState<Store[]>([]);
    const [cards, setCards] = useState<Card[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    const [storeName, setStoreName] = useState('');

    const [cardName, setCardName] = useState('');
    const [cardLastDigits, setCardLastDigits] = useState('');
    const [cardHolderName, setCardHolderName] = useState('');
    const [cardStoreId, setCardStoreId] = useState('');

    const [supplierName, setSupplierName] = useState('');
    const [supplierCnpj, setSupplierCnpj] = useState('');
    const [supplierPhone, setSupplierPhone] = useState('');
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [userPassword, setUserPassword] = useState('');
    const [userRole, setUserRole] = useState<
        'ADMIN' | 'APPROVER' | 'BUYER' | 'FINANCE'
    >('BUYER');

    const [userStoreIds, setUserStoreIds] = useState<string[]>([]);

    async function loadData() {
        try {
            setLoading(true);

            const [
                storesResponse,
                cardsResponse,
                suppliersResponse,
                usersResponse,
            ] =
                await Promise.all([
                    api.get('/stores'),
                    api.get('/cards'),
                    api.get('/suppliers'),
                    api.get('/users'),
                ]);

            setStores(storesResponse.data);
            setCards(cardsResponse.data);
            setSuppliers(suppliersResponse.data);
            setUsers(usersResponse.data);
        } catch {
            toast.error('Erro ao carregar cadastros');
        } finally {
            setLoading(false);
        }
    }

    async function createStore(e: React.FormEvent) {
        e.preventDefault();

        if (!storeName.trim()) {
            toast.error('Informe o nome da loja/empresa');
            return;
        }

        try {
            await api.post('/stores', {
                name: storeName,
            });

            toast.success('Loja/empresa cadastrada');
            setStoreName('');
            await loadData();
        } catch {
            toast.error('Erro ao cadastrar loja/empresa');
        }
    }

    async function createUser(e: React.FormEvent) {
        e.preventDefault();

        if (
            !userName.trim() ||
            !userEmail.trim() ||
            !userPassword.trim()
        ) {
            toast.error('Preencha os dados do usuário');
            return;
        }

        try {
            await api.post('/users', {
                name: userName,
                email: userEmail,
                password: userPassword,
                role: userRole,
                storeIds: userStoreIds,
            });

            toast.success('Usuário cadastrado');

            setUserName('');
            setUserEmail('');
            setUserPassword('');
            setUserRole('BUYER');
            setUserStoreIds([]);

            await loadData();
        } catch {
            toast.error('Erro ao cadastrar usuário');
        }
    }

    async function deleteUser(id: string) {
        if (!confirm('Deseja desativar este usuário?')) return;

        try {
            await api.delete(`/users/${id}`);

            toast.success('Usuário desativado');

            await loadData();
        } catch {
            toast.error('Erro ao desativar usuário');
        }
    }

    async function deleteStore(id: string) {
        if (!confirm('Deseja desativar esta loja/empresa?')) return;

        try {
            await api.delete(`/stores/${id}`);
            toast.success('Loja/empresa desativada');
            await loadData();
        } catch {
            toast.error('Erro ao desativar loja/empresa');
        }
    }

    async function createCard(e: React.FormEvent) {
        e.preventDefault();

        if (!cardName.trim() || !cardStoreId) {
            toast.error('Informe nome do cartão e loja');
            return;
        }

        try {
            await api.post('/cards', {
                name: cardName,
                lastDigits: cardLastDigits || undefined,
                holderName: cardHolderName || undefined,
                storeId: cardStoreId,
            });

            toast.success('Cartão cadastrado');

            setCardName('');
            setCardLastDigits('');
            setCardHolderName('');
            setCardStoreId('');

            await loadData();
        } catch {
            toast.error('Erro ao cadastrar cartão');
        }
    }

    async function deleteCard(id: string) {
        if (!confirm('Deseja desativar este cartão?')) return;

        try {
            await api.delete(`/cards/${id}`);
            toast.success('Cartão desativado');
            await loadData();
        } catch {
            toast.error('Erro ao desativar cartão');
        }
    }

    async function createSupplier(e: React.FormEvent) {
        e.preventDefault();

        if (!supplierName.trim()) {
            toast.error('Informe o nome do fornecedor');
            return;
        }

        try {
            await api.post('/suppliers', {
                name: supplierName,
                cnpj: supplierCnpj || undefined,
                phone: supplierPhone || undefined,
            });

            toast.success('Fornecedor cadastrado');

            setSupplierName('');
            setSupplierCnpj('');
            setSupplierPhone('');

            await loadData();
        } catch {
            toast.error('Erro ao cadastrar fornecedor');
        }
    }

    useEffect(() => {
        loadData();
    }, []);

    return (
        <AppLayout title="Cadastros">
            {loading ? (
                <p className="text-zinc-400">Carregando cadastros...</p>
            ) : (
                <div className="space-y-6">
                    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                                <Building2 size={22} />
                            </div>

                            <div>
                                <h2 className="text-lg font-bold">Lojas / Empresas</h2>
                                <p className="text-sm text-zinc-400">
                                    Cadastre as unidades que terão compras e cartões
                                </p>
                            </div>
                        </div>

                        <form
                            onSubmit={createStore}
                            className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]"
                        >
                            <input
                                value={storeName}
                                onChange={(e) => setStoreName(e.target.value)}
                                placeholder="Ex: Loja Anchieta"
                                className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />

                            <button className="flex h-12 items-center justify-center gap-2 rounded-xl bg-green-500 px-5 font-semibold text-white hover:bg-green-600">
                                <Plus size={18} />
                                Cadastrar
                            </button>
                        </form>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {stores.map((store) => (
                                <div
                                    key={store.id}
                                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="font-semibold">{store.name}</p>
                                            <p className="mt-1 text-sm text-zinc-500">
                                                {store.cards?.length || 0} cartão(ões)
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => deleteStore(store.id)}
                                            className="rounded-xl border border-red-500/30 p-2 text-red-400 hover:bg-red-500/10"
                                        >
                                            <Trash2 size={17} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="rounded-2xl bg-blue-500/10 p-3 text-blue-400">
                                <CreditCard size={22} />
                            </div>

                            <div>
                                <h2 className="text-lg font-bold">Cartões</h2>
                                <p className="text-sm text-zinc-400">
                                    Vincule um ou mais cartões a cada loja/empresa
                                </p>
                            </div>
                        </div>

                        <form
                            onSubmit={createCard}
                            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5"
                        >
                            <input
                                value={cardName}
                                onChange={(e) => setCardName(e.target.value)}
                                placeholder="Nome do cartão"
                                className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />

                            <input
                                value={cardLastDigits}
                                onChange={(e) => setCardLastDigits(e.target.value)}
                                placeholder="Final"
                                maxLength={4}
                                className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />

                            <input
                                value={cardHolderName}
                                onChange={(e) => setCardHolderName(e.target.value)}
                                placeholder="Titular"
                                className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />

                            <select
                                value={cardStoreId}
                                onChange={(e) => setCardStoreId(e.target.value)}
                                className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            >
                                <option value="">Selecione a loja</option>
                                {stores.map((store) => (
                                    <option key={store.id} value={store.id}>
                                        {store.name}
                                    </option>
                                ))}
                            </select>

                            <button className="flex h-12 items-center justify-center gap-2 rounded-xl bg-green-500 px-5 font-semibold text-white hover:bg-green-600">
                                <Plus size={18} />
                                Cadastrar
                            </button>
                        </form>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {cards.map((card) => (
                                <div
                                    key={card.id}
                                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold">{card.name}</p>
                                            <p className="mt-1 text-sm text-zinc-400">
                                                {card.store.name}
                                                {card.lastDigits && ` • final ${card.lastDigits}`}
                                            </p>
                                            <p className="mt-1 text-sm text-zinc-500">
                                                Titular: {card.holderName || 'Não informado'}
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => deleteCard(card.id)}
                                            className="rounded-xl border border-red-500/30 p-2 text-red-400 hover:bg-red-500/10"
                                        >
                                            <Trash2 size={17} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="rounded-2xl bg-orange-500/10 p-3 text-orange-400">
                                <Truck size={22} />
                            </div>

                            <div>
                                <h2 className="text-lg font-bold">Fornecedores</h2>
                                <p className="text-sm text-zinc-400">
                                    Cadastre empresas, distribuidoras e locais de compra
                                </p>
                            </div>
                        </div>

                        <form
                            onSubmit={createSupplier}
                            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
                        >
                            <input
                                value={supplierName}
                                onChange={(e) => setSupplierName(e.target.value)}
                                placeholder="Nome do fornecedor"
                                className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />

                            <input
                                value={supplierCnpj}
                                onChange={(e) => setSupplierCnpj(e.target.value)}
                                placeholder="CNPJ"
                                className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />

                            <input
                                value={supplierPhone}
                                onChange={(e) => setSupplierPhone(e.target.value)}
                                placeholder="Telefone"
                                className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />

                            <button className="flex h-12 items-center justify-center gap-2 rounded-xl bg-green-500 px-5 font-semibold text-white hover:bg-green-600">
                                <Plus size={18} />
                                Cadastrar
                            </button>
                        </form>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {suppliers.map((supplier) => (
                                <div
                                    key={supplier.id}
                                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                                >
                                    <p className="font-semibold">{supplier.name}</p>
                                    <p className="mt-1 text-sm text-zinc-400">
                                        CNPJ: {supplier.cnpj || 'Não informado'}
                                    </p>
                                    <p className="mt-1 text-sm text-zinc-500">
                                        Telefone: {supplier.phone || 'Não informado'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="rounded-2xl bg-purple-500/10 p-3 text-purple-400">
                                <Users size={22} />
                            </div>

                            <div>
                                <h2 className="text-lg font-bold">Usuários</h2>

                                <p className="text-sm text-zinc-400">
                                    Controle de acesso ao sistema
                                </p>
                            </div>
                        </div>

                        <form
                            onSubmit={createUser}
                            className="grid grid-cols-1 gap-3 xl:grid-cols-5"
                        >
                            <input
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                placeholder="Nome"
                                className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />

                            <input
                                value={userEmail}
                                onChange={(e) => setUserEmail(e.target.value)}
                                placeholder="E-mail"
                                className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />

                            <input
                                type="password"
                                value={userPassword}
                                onChange={(e) => setUserPassword(e.target.value)}
                                placeholder="Senha"
                                className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />

                            <select
                                value={userRole}
                                onChange={(e) =>
                                    setUserRole(e.target.value as any)
                                }
                                className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                            >
                                <option value="ADMIN">Administrador</option>
                                <option value="APPROVER">Aprovador</option>
                                <option value="BUYER">Comprador</option>
                                <option value="FINANCE">Financeiro</option>
                            </select>

                            <button className="flex h-12 items-center justify-center gap-2 rounded-xl bg-green-500 px-5 font-semibold text-white hover:bg-green-600">
                                <Plus size={18} />
                                Cadastrar
                            </button>
                        </form>

                        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                            <p className="mb-3 text-sm font-medium text-zinc-300">
                                Lojas permitidas
                            </p>

                            <div className="flex flex-wrap gap-2">
                                {stores.map((store) => {
                                    const selected =
                                        userStoreIds.includes(store.id);

                                    return (
                                        <button
                                            key={store.id}
                                            type="button"
                                            onClick={() => {
                                                if (selected) {
                                                    setUserStoreIds((prev) =>
                                                        prev.filter(
                                                            (id) => id !== store.id,
                                                        ),
                                                    );
                                                } else {
                                                    setUserStoreIds((prev) => [
                                                        ...prev,
                                                        store.id,
                                                    ]);
                                                }
                                            }}
                                            className={`rounded-xl border px-4 py-2 text-sm ${selected
                                                    ? 'border-green-500 bg-green-500/20 text-green-400'
                                                    : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                                                }`}
                                        >
                                            {store.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {users.map((user) => (
                                <div
                                    key={user.id}
                                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold">{user.name}</p>

                                            <p className="mt-1 text-sm text-zinc-400">
                                                {user.email}
                                            </p>

                                            <p className="mt-1 text-sm text-green-400">
                                                {user.role}
                                            </p>

                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {user.userStores?.map((item) => (
                                                    <span
                                                        key={item.store.id}
                                                        className="rounded-full bg-zinc-900 px-2 py-1 text-xs text-zinc-400"
                                                    >
                                                        {item.store.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => deleteUser(user.id)}
                                            className="rounded-xl border border-red-500/30 p-2 text-red-400 hover:bg-red-500/10"
                                        >
                                            <Trash2 size={17} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}
        </AppLayout>
    );
}