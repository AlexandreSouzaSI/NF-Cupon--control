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
                roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR'],
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
                    'FINANCEIRO',
                ],
            },
            {
                label: 'Aprovações',
                href: '/approvals',
                icon: ClipboardList,
                roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'],
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
                roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'FINANCEIRO'],
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
                roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'FINANCEIRO'],
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
                roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR'],
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
