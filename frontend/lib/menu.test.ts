import { describe, expect, it } from 'vitest';

import {
    canAccessHref,
    getHomeHref,
    isItemAllowedForFisica,
    isModuleEnabled,
    menu,
} from './menu';

describe('isModuleEnabled', () => {
    it('libera item sem módulo (item comum, sem restrição)', () => {
        expect(isModuleEnabled({ module: undefined })).toBe(true);
    });

    it('libera tudo quando enabledModules é undefined/null (loja ainda carregando)', () => {
        expect(isModuleEnabled({ module: 'COMPRAS' }, undefined)).toBe(true);
        expect(isModuleEnabled({ module: 'COMPRAS' }, null)).toBe(true);
    });

    it('bloqueia módulo não contratado pela loja', () => {
        expect(isModuleEnabled({ module: 'COMPRAS' }, ['ESTOQUE'])).toBe(false);
    });

    it('libera módulo contratado pela loja (sem restrição extra por pessoa)', () => {
        expect(isModuleEnabled({ module: 'COMPRAS' }, ['COMPRAS'])).toBe(true);
    });

    it('restrição extra por pessoa (userModuleAccess) exige as duas listas', () => {
        // Módulo habilitado na loja, mas a pessoa não tem acesso extra a ele.
        expect(
            isModuleEnabled({ module: 'COMPRAS' }, ['COMPRAS'], ['ESTOQUE']),
        ).toBe(false);

        // Módulo habilitado na loja E liberado pra pessoa.
        expect(
            isModuleEnabled({ module: 'COMPRAS' }, ['COMPRAS'], ['COMPRAS']),
        ).toBe(true);
    });

    it('userModuleAccess vazio equivale a "sem restrição extra"', () => {
        expect(isModuleEnabled({ module: 'COMPRAS' }, ['COMPRAS'], [])).toBe(
            true,
        );
    });
});

describe('canAccessHref', () => {
    it('conta demo sempre acessa qualquer rota', () => {
        expect(canAccessHref('FUNCIONARIO', '/purchases', true)).toBe(true);
    });

    it('rota que não está no menu (ex.: página pública) sempre libera', () => {
        expect(canAccessHref('FUNCIONARIO', '/rota-inexistente')).toBe(true);
    });

    it('bloqueia perfil sem permissão de role pra rota conhecida', () => {
        // /purchases não inclui FUNCIONARIO na lista de roles.
        expect(canAccessHref('FUNCIONARIO', '/purchases')).toBe(false);
    });

    it('libera perfil com permissão de role e módulo habilitado', () => {
        expect(
            canAccessHref('GERENTE', '/purchases', false, ['COMPRAS']),
        ).toBe(true);
    });

    it('bloqueia mesmo com role permitida se o módulo não está habilitado na loja', () => {
        expect(
            canAccessHref('GERENTE', '/purchases', false, ['ESTOQUE']),
        ).toBe(false);
    });

    it('bloqueia com role e módulo ok, mas sem liberação extra por pessoa', () => {
        expect(
            canAccessHref('GERENTE', '/purchases', false, ['COMPRAS'], ['ESTOQUE']),
        ).toBe(false);
    });

    it('reconhece sub-rotas (ex.: /purchases/123) pelo prefixo do item de menu', () => {
        expect(canAccessHref('FUNCIONARIO', '/purchases/123')).toBe(false);
        expect(
            canAccessHref('GERENTE', '/purchases/123', false, ['COMPRAS']),
        ).toBe(true);
    });

    it('ignora query string ao comparar o caminho', () => {
        expect(
            canAccessHref('GERENTE', '/purchases?tab=aguardando', false, [
                'COMPRAS',
            ]),
        ).toBe(true);
    });
});

describe('loja Pessoa Física', () => {
    const mods = ['CONTAS_A_PAGAR' as const];

    it('Início e Dashboard operacional não existem pra Física', () => {
        expect(canAccessHref('PROPRIETARIO', '/home', false, mods, null, 'FISICA')).toBe(false);
        expect(canAccessHref('PROPRIETARIO', '/dashboard', false, mods, null, 'FISICA')).toBe(false);
    });

    it('Início continua liberado pra loja normal', () => {
        expect(canAccessHref('PROPRIETARIO', '/home', false, undefined, null, 'JURIDICA')).toBe(true);
        expect(canAccessHref('PROPRIETARIO', '/home')).toBe(true);
    });

    it('Dashboard Financeiro e Contas a Pagar liberados pra Física', () => {
        expect(canAccessHref('PROPRIETARIO', '/financial-dashboard', false, mods, null, 'FISICA')).toBe(true);
        expect(canAccessHref('PROPRIETARIO', '/bills', false, mods, null, 'FISICA')).toBe(true);
    });

    it('módulos de negócio ficam fora mesmo se o cookie vier sem lista de módulos', () => {
        for (const href of ['/tasks', '/purchases', '/estoque', '/conciliacao-caixa', '/meep', '/losses']) {
            expect(canAccessHref('PROPRIETARIO', href, false, undefined, null, 'FISICA')).toBe(false);
        }
    });

    it('menu da Física = Dashboard Financeiro, Contas a Pagar, Cadastros e Dúvidas (nesta ordem)', () => {
        const labels = menu
            .flatMap((group) => group.items)
            .filter(
                (item) =>
                    !item.hidden &&
                    item.roles.includes('PROPRIETARIO') &&
                    isModuleEnabled(item, mods) &&
                    isItemAllowedForFisica(item),
            )
            .map((item) => item.label);

        expect(labels).toEqual([
            'Dashboard Financeiro',
            'Contas a Pagar',
            'Cadastros',
            'Dúvidas',
        ]);
    });

    it('home da Física é o Dashboard Financeiro; da loja normal é /home', () => {
        expect(getHomeHref('PROPRIETARIO', 'FISICA', false, mods)).toBe('/financial-dashboard');
        expect(getHomeHref('PROPRIETARIO', 'JURIDICA')).toBe('/home');
        expect(getHomeHref('PROPRIETARIO')).toBe('/home');
    });

    it('perfil sem acesso ao Dashboard Financeiro não entra em loop de redirect', () => {
        // Gerente não vê Dashboard Financeiro nem Contas a Pagar.
        expect(getHomeHref('GERENTE', 'FISICA', false, mods)).toBe('/help');
    });
});
