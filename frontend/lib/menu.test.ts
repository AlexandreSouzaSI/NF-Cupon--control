import { describe, expect, it } from 'vitest';

import { canAccessHref, isModuleEnabled } from './menu';

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
