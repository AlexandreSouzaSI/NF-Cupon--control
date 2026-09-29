import '@testing-library/jest-dom/vitest';

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Sem `test.globals: true` no vitest.config.ts, o auto-cleanup do RTL entre
// testes não é registrado sozinho — cada `render()` de um teste ficava
// empilhado no DOM do teste seguinte (mesmo arquivo), gerando erros do tipo
// "Found multiple elements with the text: Continuar". Registra explicitamente
// aqui, uma vez, pra valer em todo arquivo de teste de componente.
afterEach(() => {
    cleanup();
});
