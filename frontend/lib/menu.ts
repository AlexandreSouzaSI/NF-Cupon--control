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
    ListChecks,
    PackageX,
    LayoutDashboard,
} from 'lucide-react';

import type { UserRole } from './auth';

export type MenuRole = UserRole;

export type BadgeKey = 'approvals' | 'alerts' | 'notifications';

// Cor de referência visual de cada item — soft (fundo bem clarinho +
// texto na cor), pra dar uma pista rápida do "tipo" da tela sem gritar.
// Ex: Perdas = vermelho (é sempre algo ruim), Tarefas = violeta, etc.
export type MenuColor =
    | 'sky'
    | 'blue'
    | 'amber'
    | 'purple'
    | 'red'
    | 'teal'
    | 'indigo'
    | 'slate'
    | 'pink'
    | 'cyan'
    | 'orange'
    | 'violet';

export const menuColorStyles: Record<
    MenuColor,
    { bg: string; text: string }
> = {
    sky: { bg: 'bg-sky-500/10', text: 'text-sky-500' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-500' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-500' },
    red: { bg: 'bg-red-500/10', text: 'text-red-500' },
    teal: { bg: 'bg-teal-500/10', text: 'text-teal-500' },
    indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-500' },
    slate: { bg: 'bg-slate-500/10', text: 'text-slate-500' },
    pink: { bg: 'bg-pink-500/10', text: 'text-pink-500' },
    cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-500' },
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-500' },
    violet: { bg: 'bg-violet-500/10', text: 'text-violet-500' },
};

export type MenuItem = {
    label: string;
    href: string;
    icon: LucideIcon;
    roles: MenuRole[];
    badgeKey?: BadgeKey;
    color: MenuColor;
    // Módulo temporariamente fora de foco — some do menu lateral, do
    // drawer mobile e da página Início, mas a rota continua funcionando
    // normalmente se alguém acessar direto (não é bloqueio de permissão,
    // só visibilidade). Reversível: é só tirar o "hidden" depois.
    hidden?: boolean;
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
    'FUNCIONARIO',
];

export const menu: MenuGroup[] = [
    {
        group: 'Principal',
        items: [
            {
                label: 'Início',
                href: '/home',
                icon: Home,
                roles: ALL_ROLES,
                color: 'slate',
            },
            {
                label: 'Dashboard',
                href: '/dashboard',
                icon: LayoutDashboard,
                roles: ALL_ROLES,
                color: 'sky',
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
                color: 'blue',
                hidden: true,
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
                color: 'blue',
                hidden: true,
            },
            {
                label: 'Aprovações',
                href: '/approvals',
                icon: ClipboardList,
                roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR'],
                badgeKey: 'approvals',
                color: 'amber',
                hidden: true,
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
                color: 'purple',
                hidden: true,
            },
            {
                label: 'Serviços',
                href: '/services',
                icon: Briefcase,
                // Funcionário não participa desse módulo no projeto
                // reduzido — só Perdas e Tarefas (próprias).
                roles: [
                    'ADMINISTRATIVO',
                    'PROPRIETARIO',
                    'GERENTE',
                    'COMPRADOR',
                    'ESTOQUISTA',
                    'FINANCEIRO',
                ],
                color: 'purple',
            },
            {
                label: 'Perdas',
                href: '/losses',
                icon: PackageX,
                roles: [
                    'ADMINISTRATIVO',
                    'PROPRIETARIO',
                    'GERENTE',
                    'COMPRADOR',
                    'ESTOQUISTA',
                    'FUNCIONARIO',
                ],
                color: 'red',
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
                color: 'teal',
                hidden: true,
            },
        ],
    },
    {
        group: 'Tarefas',
        items: [
            {
                label: 'Tarefas',
                href: '/tasks',
                icon: ListChecks,
                roles: ALL_ROLES,
                color: 'violet',
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
                color: 'indigo',
                hidden: true,
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
                color: 'slate',
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
                color: 'pink',
                hidden: true,
            },
            {
                label: 'Freelancer',
                href: '/freelancers',
                icon: UserPlus,
                roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'],
                color: 'pink',
                hidden: true,
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
                color: 'cyan',
                hidden: true,
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
                color: 'orange',
                hidden: true,
            },
            {
                label: 'Notificações',
                href: '/notifications',
                icon: Bell,
                roles: ALL_ROLES,
                badgeKey: 'notifications',
                color: 'sky',
                // Agora tem um sino de acesso rápido no topo, perto do
                // seletor de loja — some do menu lateral/drawer/Início pra
                // não duplicar, mas a rota continua normal.
                hidden: true,
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
