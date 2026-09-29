import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// AppLayout puxa router/tema/menu/badges — não é o que testamos aqui.
vi.mock('../../../src/components/app-layout', () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
}));

const push = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
    useSearchParams: () => searchParamsValue,
}));

vi.mock('@/lib/api', () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
    },
    API_URL: 'http://localhost:4000',
}));

vi.mock('@/lib/active-store', () => ({
    getActiveStore: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { toast } from 'sonner';

import NewBillPage from './page';

const apiGet = api.get as unknown as ReturnType<typeof vi.fn>;
const apiPost = api.post as unknown as ReturnType<typeof vi.fn>;
const mockGetActiveStore = getActiveStore as unknown as ReturnType<
    typeof vi.fn
>;

// Fixture do boleto.test.ts — código de barras válido (DV mod11 ok),
// R$ 123,45, vencimento 2025-06-02.
const VALID_BARCODE = '34199110000000123451234567890123456789012345'.slice(
    0,
    44,
);

function fillMandatoryFields() {
    fireEvent.change(
        screen.getByPlaceholderText('Ex.: Boleto Açougue Central'),
        { target: { value: 'Conta de teste' } },
    );

    fireEvent.change(screen.getByPlaceholderText('0,00'), {
        target: { value: '150,00' },
    });

    const dateInput = document.querySelector(
        'input[type="date"]',
    ) as HTMLInputElement;

    fireEvent.change(dateInput, { target: { value: '2026-10-15' } });
}

beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    push.mockReset();
    (toast.success as ReturnType<typeof vi.fn>).mockReset();
    (toast.error as ReturnType<typeof vi.fn>).mockReset();

    searchParamsValue = new URLSearchParams();

    mockGetActiveStore.mockReturnValue({
        id: 'store-1',
        name: 'Anchieta',
    });

    apiGet.mockResolvedValue({ data: [] });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('NewBillPage — validação', () => {
    it('bloqueia envio sem descrição', async () => {
        const user = userEvent.setup();

        render(<NewBillPage />);

        const submit = await screen.findByText('Salvar conta');
        await user.click(submit);

        expect(toast.error).toHaveBeenCalledWith('Informe a descrição.');
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('bloqueia envio com valor inválido (zero)', async () => {
        const user = userEvent.setup();

        render(<NewBillPage />);

        await screen.findByText('Salvar conta');

        fireEvent.change(
            screen.getByPlaceholderText('Ex.: Boleto Açougue Central'),
            { target: { value: 'Conta de teste' } },
        );

        await user.click(screen.getByText('Salvar conta'));

        expect(toast.error).toHaveBeenCalledWith('Informe um valor válido.');
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('bloqueia envio sem vencimento', async () => {
        const user = userEvent.setup();

        render(<NewBillPage />);

        await screen.findByText('Salvar conta');

        fireEvent.change(
            screen.getByPlaceholderText('Ex.: Boleto Açougue Central'),
            { target: { value: 'Conta de teste' } },
        );

        fireEvent.change(screen.getByPlaceholderText('0,00'), {
            target: { value: '150,00' },
        });

        await user.click(screen.getByText('Salvar conta'));

        expect(toast.error).toHaveBeenCalledWith('Informe o vencimento.');
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('PIX sem chave nem copia-e-cola bloqueia envio', async () => {
        const user = userEvent.setup();

        render(<NewBillPage />);

        await screen.findByText('Salvar conta');
        fillMandatoryFields();

        const typeSelect = document.querySelector(
            '[data-tour="bill-form-type"]',
        ) as HTMLSelectElement;
        fireEvent.change(typeSelect, { target: { value: 'PIX' } });

        await user.click(screen.getByText('Salvar conta'));

        expect(toast.error).toHaveBeenCalledWith(
            'Informe a chave PIX ou o PIX copia e cola.',
        );
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('transferência bancária sem banco bloqueia envio', async () => {
        const user = userEvent.setup();

        render(<NewBillPage />);

        await screen.findByText('Salvar conta');
        fillMandatoryFields();

        const typeSelect = document.querySelector(
            '[data-tour="bill-form-type"]',
        ) as HTMLSelectElement;
        fireEvent.change(typeSelect, { target: { value: 'NO_BILL' } });

        await user.click(screen.getByText('Salvar conta'));

        expect(toast.error).toHaveBeenCalledWith(
            'Informe o banco da transferência.',
        );
        expect(apiPost).not.toHaveBeenCalled();
    });
});

describe('NewBillPage — submissão', () => {
    it('envia os dados corretos (caminho feliz, boleto) e navega pra /bills', async () => {
        const user = userEvent.setup();

        apiPost.mockResolvedValueOnce({ data: { id: 'bill-1' } });

        render(<NewBillPage />);

        await screen.findByText('Salvar conta');
        fillMandatoryFields();

        await user.click(screen.getByText('Salvar conta'));

        await waitFor(() => {
            expect(apiPost).toHaveBeenCalledWith(
                '/bills',
                expect.objectContaining({
                    description: 'Conta de teste',
                    value: 150,
                    type: 'BOLETO',
                    paymentMethod: 'BANK_SLIP',
                    dueDate: '2026-10-15',
                    storeId: 'store-1',
                }),
            );
        });

        expect(toast.success).toHaveBeenCalledWith('Conta a pagar criada.');
        expect(push).toHaveBeenCalledWith('/bills');
    });

    it('quando veio de uma compra (?purchaseId=), navega de volta pra /purchases/:id', async () => {
        const user = userEvent.setup();

        searchParamsValue = new URLSearchParams({ purchaseId: 'p-1' });

        apiGet.mockImplementation((url: string) => {
            if (url === '/suppliers') {
                return Promise.resolve({ data: [] });
            }

            if (url === '/purchases/p-1') {
                return Promise.resolve({
                    data: {
                        id: 'p-1',
                        description: 'Compra de bebidas',
                        value: '150.00',
                        dueDate: null,
                        store: { id: 'store-1', name: 'Anchieta' },
                        supplier: null,
                        fiscalDocuments: [{ type: 'INVOICE' }],
                        noInvoiceProductsNote: null,
                        items: [],
                    },
                });
            }

            return Promise.resolve({ data: [] });
        });

        apiPost.mockResolvedValueOnce({ data: { id: 'bill-1' } });

        render(<NewBillPage />);

        await screen.findByText('Salvar conta');

        // Descrição já vem pré-preenchida com a da compra — só falta
        // vencimento (não veio da compra nesse fixture).
        const dateInput = document.querySelector(
            'input[type="date"]',
        ) as HTMLInputElement;
        fireEvent.change(dateInput, { target: { value: '2026-10-20' } });

        await user.click(screen.getByText('Salvar conta'));

        await waitFor(() => {
            expect(apiPost).toHaveBeenCalledWith(
                '/bills',
                expect.objectContaining({ purchaseId: 'p-1' }),
            );
        });

        expect(push).toHaveBeenCalledWith('/purchases/p-1');
    });

    it('compra sem NF nem cupom exige descrição dos produtos antes de salvar', async () => {
        const user = userEvent.setup();

        searchParamsValue = new URLSearchParams({ purchaseId: 'p-2' });

        apiGet.mockImplementation((url: string) => {
            if (url === '/suppliers') {
                return Promise.resolve({ data: [] });
            }

            if (url === '/purchases/p-2') {
                return Promise.resolve({
                    data: {
                        id: 'p-2',
                        description: 'Compra sem NF',
                        value: '80.00',
                        dueDate: null,
                        store: { id: 'store-1', name: 'Anchieta' },
                        supplier: null,
                        fiscalDocuments: [],
                        noInvoiceProductsNote: null,
                        items: [],
                    },
                });
            }

            return Promise.resolve({ data: [] });
        });

        render(<NewBillPage />);

        await screen.findByText(
            'Compra sem NF — descrição obrigatória',
        );

        const dateInput = document.querySelector(
            'input[type="date"]',
        ) as HTMLInputElement;
        fireEvent.change(dateInput, { target: { value: '2026-10-20' } });

        await user.click(screen.getByText('Salvar conta'));

        expect(toast.error).toHaveBeenCalledWith(
            'Essa compra não tem NF nem cupom anexado. Descreva os produtos comprados ou envie a foto da notinha antes de salvar.',
        );
        expect(apiPost).not.toHaveBeenCalled();
    });

    it('preenche a descrição dos produtos e o envio passa a funcionar', async () => {
        const user = userEvent.setup();

        searchParamsValue = new URLSearchParams({ purchaseId: 'p-2' });

        apiGet.mockImplementation((url: string) => {
            if (url === '/suppliers') {
                return Promise.resolve({ data: [] });
            }

            if (url === '/purchases/p-2') {
                return Promise.resolve({
                    data: {
                        id: 'p-2',
                        description: 'Compra sem NF',
                        value: '80.00',
                        dueDate: null,
                        store: { id: 'store-1', name: 'Anchieta' },
                        supplier: null,
                        fiscalDocuments: [],
                        noInvoiceProductsNote: null,
                        items: [],
                    },
                });
            }

            return Promise.resolve({ data: [] });
        });

        apiPost.mockResolvedValueOnce({ data: { id: 'bill-2' } });

        render(<NewBillPage />);

        await screen.findByText(
            'Compra sem NF — descrição obrigatória',
        );

        const dateInput = document.querySelector(
            'input[type="date"]',
        ) as HTMLInputElement;
        fireEvent.change(dateInput, { target: { value: '2026-10-20' } });

        fireEvent.change(
            screen.getByPlaceholderText(
                'Ex: 2 caixas de refrigerante, 10kg de carne, 1 fardo de água...',
            ),
            { target: { value: '2 caixas de refrigerante' } },
        );

        await user.click(screen.getByText('Salvar conta'));

        await waitFor(() => {
            expect(apiPost).toHaveBeenCalledWith(
                '/bills',
                expect.objectContaining({
                    noInvoiceProductsNote: '2 caixas de refrigerante',
                }),
            );
        });
    });
});

describe('NewBillPage — regressão: valor pré-preenchido da compra', () => {
    // Bug real encontrado ao escrever este teste (corrigido em
    // app/bills/new/page.tsx): quando a conta vem de uma compra
    // (?purchaseId=...), o campo Valor era pré-preenchido com
    // `String(purchase.value)` — ex.: "150.00" ou "45.67" (ponto decimal,
    // formato de banco/Prisma). Só que parseDecimal() (chamado no submit)
    // foi escrito pra entender formato pt-BR digitado à mão (ponto = milhar,
    // vírgula = decimal) — ele removia o ponto em vez de tratá-lo como
    // decimal. Resultado: se o usuário não apagasse e redigitasse o campo
    // Valor manualmente antes de salvar, a conta era criada com 100x o
    // valor real (R$ 150,00 virava R$ 15.000,00; R$ 45,67 virava R$
    // 4.567,00). Corrigido formatando o pré-preenchimento no mesmo formato
    // pt-BR que o campo usa (toFixed(2) + vírgula) — este teste trava esse
    // comportamento.
    it(
        'valor pré-preenchido da compra não multiplica por 100 ao salvar sem editar',
        async () => {
            const user = userEvent.setup();

            searchParamsValue = new URLSearchParams({ purchaseId: 'p-3' });

            apiGet.mockImplementation((url: string) => {
                if (url === '/suppliers') {
                    return Promise.resolve({ data: [] });
                }

                if (url === '/purchases/p-3') {
                    return Promise.resolve({
                        data: {
                            id: 'p-3',
                            description: 'Compra de hortifruti',
                            value: '45.67',
                            dueDate: null,
                            store: { id: 'store-1', name: 'Anchieta' },
                            supplier: null,
                            fiscalDocuments: [{ type: 'INVOICE' }],
                            noInvoiceProductsNote: null,
                            items: [],
                        },
                    });
                }

                return Promise.resolve({ data: [] });
            });

            apiPost.mockResolvedValueOnce({ data: { id: 'bill-3' } });

            render(<NewBillPage />);

            await screen.findByText('Salvar conta');

            const dateInput = document.querySelector(
                'input[type="date"]',
            ) as HTMLInputElement;
            fireEvent.change(dateInput, { target: { value: '2026-10-20' } });

            // Usuário NÃO mexe no campo Valor — confia no que já veio
            // preenchido da compra (comportamento normal esperado).
            await user.click(screen.getByText('Salvar conta'));

            await waitFor(() => {
                expect(apiPost).toHaveBeenCalledWith(
                    '/bills',
                    expect.objectContaining({ value: 45.67 }),
                );
            });
        },
    );
});

describe('NewBillPage — leitura de boleto', () => {
    it('preenche valor e vencimento ao colar um código de barras válido', async () => {
        render(<NewBillPage />);

        const barcodeField = await screen.findByPlaceholderText(
            'Bipe com a leitora ou digite/cole o código do boleto',
        );

        fireEvent.change(barcodeField, {
            target: { value: VALID_BARCODE },
        });

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalled();
        });

        const valueField = screen.getByPlaceholderText(
            '0,00',
        ) as HTMLInputElement;
        const dateField = document.querySelector(
            'input[type="date"]',
        ) as HTMLInputElement;

        expect(valueField.value).toBe('123,45');
        expect(dateField.value).toBe('2025-06-02');
    });

    it('não preenche nada quando o dígito verificador não confere', async () => {
        render(<NewBillPage />);

        const barcodeField = await screen.findByPlaceholderText(
            'Bipe com a leitora ou digite/cole o código do boleto',
        );

        const corrupted =
            VALID_BARCODE.slice(0, 4) +
            (VALID_BARCODE[4] === '9' ? '0' : '9') +
            VALID_BARCODE.slice(5);

        fireEvent.change(barcodeField, {
            target: { value: corrupted },
        });

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalled();
        });

        const valueField = screen.getByPlaceholderText(
            '0,00',
        ) as HTMLInputElement;

        expect(valueField.value).toBe('');
    });
});
