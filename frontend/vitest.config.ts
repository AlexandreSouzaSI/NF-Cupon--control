import { defineConfig } from 'vitest/config';
import path from 'path';

// Ambiente 'jsdom' pra cobrir tanto lógica pura (lib/*.ts, que não precisa
// de DOM) quanto os testes de componente (app/**/*.test.tsx, que precisam).
// Os testes que tocam cookie (auth.ts, active-store.ts) continuam mockando
// 'js-cookie' diretamente em vez de depender de document.cookie real.
export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        include: ['lib/**/*.test.ts', 'app/**/*.test.tsx'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
});
