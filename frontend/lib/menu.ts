import type { LucideIcon } from 'lucide-react';
import {
    Home,
    ShoppingCart,
    ClipboardList,
    Receipt,
    Briefcase,
    Wallet,
    BarChart3,
    Bell,
    AlertTriangle,
    Users,
    UserCog,
    UserPlus,
    TrendingUp,
} from 'lucide-react';

import type { UserRole } from './auth';

export type MenuRole = UserRole;

export type BadgeKey = 'approvals' | 'alerts' | 'notifications';

export type MenuItem = {
    label: string;
    href: string;
    icon: LucideIcon;
    roles: MenuRole[];
    badgeKey?: BadgeKey;
};

export type MenuGroup = {
    group: string;
    items: MenuItem[];
};

const ALL_ROLES: MenuRole[] = [
    'ADMINISTRATIVO',
    'PROPRIETARIO',
    'GERENTE',
    'COMPRADOR',
    'ESTOQUISTA',
    'FINANCEIRO',
];

export const menu: MenuGroup[] = [
    {
        group: 'Principal',
        items: [
            {
                label: 'Dashboard',
                href: '/dashboard',
                icon: Home,
                roles: ALL_ROLES,
            },
        ],
    },
    {
        group: 'Compras',
        items: [
            {
                label: 'Nova Compra',
                href: '/purchases/new',
                icon: ShoppingCart,
                roles: [
                    'ADMINISTRATIVO',
                    'PROPRIETARIO',
                    'GERENTE',
                    'COMPRADOR',
                    'ESTOQUISTA',
                ],
            },
            {
                label: 'Compras',
                href: '/purchases',
                icon: ClipboardList,
                roles: [
                    'ADMINISTRATIVO',
                    'PROPRIETARIO',
                    'GERENTE',
                    'COMPRADOR',
                    'ESTOQUISTA',
                ],
            },
            {
                label: 'Aprovações',
                href: '/approvals',
                icon: ClipboardList,
                roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR'],
                badgeKey: 'approvals',
            },
        ],
    },
    {
        group: 'Fiscal',
        items: [
            {
                label: 'Cupons e NF',
                href: '/fiscal-documents',
                icon: Receipt,
                roles: ALL_ROLES,
            },
            {
                label: 'Serviços',
                href: '/services',
                icon: Briefcase,
                roles: ALL_ROLES,
            },
        ],
    },
    {
        group: 'Financeiro',
        items: [
            {
                label: 'Contas a Pagar',
                href: '/bills',
                icon: Wallet,
                roles: ALL_ROLES,
            },
        ],
    },
    {
        group: 'Relatórios',
        items: [
            {
                label: 'Relatórios',
                href: '/reports',
                icon: BarChart3,
                roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'],
            },
        ],
    },
    {
        group: 'Cadastros',
        items: [
            {
                label: 'Cadastros',
                href: '/cadastros',
                icon: Users,
                roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'],
            },
        ],
    },
    {
        group: 'RH',
        items: [
            {
                label: 'Funcionários',
                href: '/employees',
                icon: UserCog,
                roles: ['ADMINISTRATIVO', 'PROPRIETARIO'],
            },
            {
                label: 'Freelancer',
                href: '/freelancers',
                icon: UserPlus,
                roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'],
            },
        ],
    },
    {
        group: 'Tributos',
        items: [
            {
                label: 'Tributos',
                href: '/revenue',
                icon: TrendingUp,
                roles: [
                    'ADMINISTRATIVO',
                    'PROPRIETARIO',
                    'GERENTE',
                    'COMPRADOR',
                    'FINANCEIRO',
                ],
            },
        ],
    },
    {
        group: 'Sistema',
        items: [
            {
                label: 'Alertas',
                href: '/alerts',
                icon: AlertTriangle,
                roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'FINANCEIRO'],
                badgeKey: 'alerts',
            },
            {
                label: 'Notificações',
                href: '/notifications',
                icon: Bell,
                roles: ALL_ROLES,
                badgeKey: 'notifications',
            },
        ],
    },
];

// Usado pelo Dashboard pra decidir se mostra um card/atalho pra um perfil,
// reaproveitando a mesma matriz de roles do menu — assim as duas coisas
// nunca ficam dessincronizadas. Faz match exato do path (ignorando query
// string) ou por prefixo, pra cobrir rotas com parâmetro (ex: uma tarefa
// apontando pra "/purchases/123" cai no item de menu "/purchases").
// Rotas que não existem no menu (não mapeadas) ficam liberadas por padrão.
export function canAccessHref(role: MenuRole, href: string): boolean {
    const path = href.split('?')[0];
    const allItems = menu.flatMap((group) => group.items);

    const matchedItem = allItems.find(
        (item) => path === item.href || path.startsWith(`${item.href}/`),
    );

    if (!matchedItem) return true;

    return matchedItem.roles.includes(role);
}
