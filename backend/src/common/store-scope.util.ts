import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

// Correção de um bug de isolamento multi-tenant que existia copiado em
// ~20 services (Compras, Contas a Pagar, Tarefas, Funcionários,
// Freelancers, Perdas, Devolução, Serviços, NF de Saída, Cartões,
// Dashboard, Relatórios, Tributos, Alertas, Regras de Aprovação, Estoque,
// Cotação, Caixa, Produção, Dashboards Financeiro/Fiscal): cada um tinha
// seu próprio `getAllowedStoreIds(user)` que devolvia `undefined` (= sem
// filtro nenhum) pra ADMINISTRATIVO/PROPRIETARIO. Isso foi escrito quando
// só existia a empresa Nugalho no banco, então "todas as lojas" e "todas
// as lojas da empresa" eram a mesma coisa. Com múltiplas empresas-cliente
// no mesmo banco (ver docs/BUSINESS_RULES.md, model Empresa), isso virou
// um vazamento real: um Proprietário/Administrativo de QUALQUER empresa
// via/mexia em dado de TODAS as empresas.
//
// Esse helper centraliza a resolução correta — é a ÚNICA fonte de verdade
// sobre "quais lojas esse usuário pode acessar num escopo global" pra
// todos os services que tinham a cópia antiga. Cada service continua
// tendo seus próprios `getAllowedStoreIds`/`ensureStoreAccess` privados
// (pra não precisar reescrever toda a assinatura de cada call site), mas
// agora eles só delegam pra cá.
export async function resolveAllowedStoreIds(
    prisma: PrismaService,
    user: any,
): Promise<string[] | undefined> {
    if (!user) return undefined;

    // Admin Master sem loja ativa selecionada no topo (ex.: painel
    // /admin): comportamento antigo, vê/gerencia tudo, de propósito — é
    // assim que ele cruza empresas pra administrar o sistema. Com loja
    // ativa selecionada (activeStoreEmpresaId, resolvido no
    // jwt.strategy.ts a partir do header x-store-id), cai no mesmo
    // escopo por empresa dos outros perfis com acesso global.
    const empresaId = user.isAdminMaster
        ? user.activeStoreEmpresaId
        : user.empresaId;

    if (user.isAdminMaster && !empresaId) {
        return undefined;
    }

    const hasGlobalAccess =
        user.isAdminMaster ||
        user.role === UserRole.ADMINISTRATIVO ||
        user.role === UserRole.PROPRIETARIO;

    if (hasGlobalAccess) {
        // "Acesso global" sempre foi pra significar "todas as lojas da
        // própria empresa", nunca "todas as lojas do banco inteiro" — só
        // que antes disso virar multi-tenant não fazia diferença, porque
        // só existia uma empresa. Agora precisa da lista de verdade.
        const stores = await prisma.store.findMany({
            where: { empresaId },
            select: { id: true },
        });

        return stores.map((store) => store.id);
    }

    return (
        user.userStores?.map((item: any) => item.storeId || item.store?.id) ||
        []
    );
}

export async function ensureStoreAccessScoped(
    prisma: PrismaService,
    storeId: string,
    user: any,
) {
    const allowedStoreIds = await resolveAllowedStoreIds(prisma, user);

    if (!allowedStoreIds) return;

    if (!allowedStoreIds.includes(storeId)) {
        throw new ForbiddenException('Você não tem acesso a esta loja.');
    }
}
