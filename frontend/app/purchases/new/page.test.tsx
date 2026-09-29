import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// AppLayout puxa router/tema/menu/badges — não é o que testamos aqui.
vi.mock('../../../src/components/app-layout', () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
}));

// VoicePurchaseButton grava áudio (getUserMedia) — não existe em jsdom e não
// é o alvo destes testes (fluxo manual de preenchimento).
vi.mock('../../../src/components/purchases/VoicePurchaseButton', () => ({
    VoicePurchaseButton: () => null,
}));

const push = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
    },
}));

vi.mock('@/lib/active-store', () => ({
    getActiveStore: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: Object.assign(vi.fn(), {
        success: vi.fn(),
        error: vi.fn(),
    }),
}));

import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { toast } from 'sonner';

import NewPurchasePage from './page';

const apiGet = api.get as unknown as ReturnType<typeof vi.fn>;
const apiPost = api.post as unknown as ReturnType<typeof vi.fn>;
const mockGetActiveStore = getActiveStore as unknown as ReturnType<
    typeof vi.fn
>;

function fillDescriptionAndSupplier() {
    fireEvent.change(
        screen.getByPlaceholderText('Ex.: Pedido semanal de carnes'),
        { target: { value: 'Pedido semanal' } },
    );

    fireEvent.change(
        screen.getByPlaceholderText('Digite o nome do fornecedor'),
        { target: { value: 'Açougue Central' } },
    );
}

beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    push.mockReset();
    (toast as unknown as ReturnType<typeof vi.fn>).mockReset();
    (toast.success as ReturnType<typeof vi.fn>).mockReset();
    (toast.error as ReturnType<typeof vi.fn>).mockReset();

    mockGetActiveStore.mockReturnValue({
        id: 'store-1',
        name: 'Anchieta',
    });

    apiGet.mockResolvedValue({ data: [] });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('NewPurchasePage — validação da etapa 1', () => {
    it('bloqueia continuar sem descrição', async () => {
        const user = userEvent.setup();

        render(<NewPurchasePage />);

        const continueButton = await screen.findByText('Continuar');
        await user.click(continueButton);

        expect(toast.error).toHaveBeenCalledWith(
            'Informe a descrição da compra.',
        );
        // Continua na etapa 1 (não renderizou a seção de Itens).
        expect(screen.queryByText('Itens da compra')).not.toBeInTheDocument();
    });

    it('bloqueia continuar sem fornecedor no tipo "Pedido com fornecedor"', async () => {
        const user = userEvent.setup();

        render(<NewPurchasePage />);

        await screen.findByText('Continuar');

        fireEvent.change(
            screen.getByPlaceholderText('Ex.: Pedido semanal de carnes'),
            { target: { value: 'Pedido semanal' } },
        );

        await user.click(screen.getByText('Continuar'));

        expect(toast.error).toHaveBeenCalledWith('Informe o fornecedor.');
    });

    it('compra avulsa exige cartão quando forma de pagamento é cartão de crédito', async () => {
        const user = userEvent.setup();

        render(<NewPurchasePage />);

        await screen.findByText('Continuar');

        const categorySelect = document.querySelector(
            '[data-tour="purchase-category"]',
        ) as HTMLSelectElement;
        fireEvent.change(categorySelect, { target: { value: 'AVULSA_CARD' } });

        fireEvent.change(
            screen.getByPlaceholderText('Ex.: Pedido semanal de carnes'),
            { target: { value: 'Compra avulsa de gelo' } },
        );

        await user.click(screen.getByText('Continuar'));

        expect(toast.error).toHaveBeenCalledWith('Selecione o cartão.');
    });

    it('modo simplificado exige valor final', async () => {
        const user = userEvent.setup();

        render(<NewPurchasePage />);

        await screen.findByText('Continuar');

        await user.click(screen.getByText('Cadastro simplificado'));

        fillDescriptionAndSupplier();

        await user.click(screen.getByText('Continuar'));

        expect(toast.error).toHaveBeenCalledWith(
            'Informe o valor final da compra.',
        );
    });
});

describe('NewPurchasePage — validação da etapa 2 (itens)', () => {
    it('bloqueia avançar pra revisão sem nenhum item válido', async () => {
        const user = userEvent.setup();

        render(<NewPurchasePage />);

        await screen.findByText('Continuar');
        fillDescriptionAndSupplier();

        await user.click(screen.getByText('Continuar'));

        // Etapa 2: item padrão vem sem nome preenchido.
        await screen.findByText('Itens da compra');
        await user.click(screen.getByText('Continuar'));

        expect(toast.error).toHaveBeenCalledWith(
            'Cadastre pelo menos um item válido.',
        );
    });
});

describe('NewPurchasePage — submissão', () => {
    it('caminho feliz (item a item): calcula o total e envia o payload correto', async () => {
        const user = userEvent.setup();

        apiPost.mockImplementation((url: string) => {
            if (url === '/suppliers/find-or-create') {
                return Promise.resolve({ data: { id: 'supplier-1' } });
            }

            if (url === '/purchases') {
                return Promise.resolve({ data: { id: 'purchase-1' } });
            }

            return Promise.resolve({ data: {} });
        });

        render(<NewPurchasePage />);

        await screen.findByText('Continuar');
        fillDescriptionAndSupplier();
        await user.click(screen.getByText('Continuar'));

        await screen.findByText('Itens da compra');

        fireEvent.change(screen.getByPlaceholderText('Ex.: Contra-filé'), {
            target: { value: 'Contra-filé' },
        });

        const inputs = document.querySelectorAll(
            '.md\\:grid-cols-6 input',
        );
        // Ordem no DOM: Produto, Quantidade, Valor unitário, Total,
        // Observação (Unidade é um <select>, não <input>).
        const quantityInput = inputs[1] as HTMLInputElement;
        const unitPriceInput = inputs[2] as HTMLInputElement;

        fireEvent.change(quantityInput, { target: { value: '2' } });
        fireEvent.change(unitPriceInput, { target: { value: '10,50' } });

        await user.click(screen.getByText('Continuar'));

        await screen.findByText('Revisão da compra');
        await user.click(screen.getByText('Confirmar compra'));

        await waitFor(() => {
            expect(apiPost).toHaveBeenCalledWith(
                '/purchases',
                expect.objectContaining({
                    description: 'Pedido semanal',
                    value: 21,
                    method: 'BOLETO',
                    storeId: 'store-1',
                    supplierId: 'supplier-1',
                    category: 'SUPPLIER_ORDER',
                    origin: 'NORMAL',
                    items: [
                        expect.objectContaining({
                            name: 'Contra-filé',
                            quantity: 2,
                            unitPrice: 10.5,
                            total: 21,
                        }),
                    ],
                }),
            );
        });

        expect(toast.success).toHaveBeenCalledWith(
            'Compra cadastrada com sucesso.',
        );
        expect(push).toHaveBeenCalledWith('/purchases');
    });

    it('modo simplificado: pula a etapa de itens e envia 1 item com o valor final', async () => {
        const user = userEvent.setup();

        apiPost.mockImplementation((url: string) => {
            if (url === '/suppliers/find-or-create') {
                return Promise.resolve({ data: { id: 'supplier-2' } });
            }

            if (url === '/purchases') {
                return Promise.resolve({ data: { id: 'purchase-2' } });
            }

            return Promise.resolve({ data: {} });
        });

        render(<NewPurchasePage />);

        await screen.findByText('Continuar');

        await user.click(screen.getByText('Cadastro simplificado'));
        fillDescriptionAndSupplier();

        fireEvent.change(screen.getByPlaceholderText('0,00'), {
            target: { value: '300,00' },
        });

        await user.click(screen.getByText('Continuar'));

        // Pulou direto pra Revisão (sem passar pela etapa de Itens).
        await screen.findByText('Revisão da compra');
        expect(
            screen.getByText('Cadastro simplificado — sem item a item'),
        ).toBeInTheDocument();

        await user.click(screen.getByText('Confirmar compra'));

        await waitFor(() => {
            expect(apiPost).toHaveBeenCalledWith(
                '/purchases',
                expect.objectContaining({
                    value: 300,
                    supplierId: 'supplier-2',
                    items: [
                        expect.objectContaining({
                            name: 'Pedido semanal',
                            quantity: 1,
                            total: 300,
                        }),
                    ],
                }),
            );
        });

        expect(push).toHaveBeenCalledWith('/purchases');
    });

    it('cartão selecionado via autocomplete é enviado como cardId', async () => {
        const user = userEvent.setup();

        apiGet.mockImplementation((url: string) => {
            if (url === '/cards') {
                return Promise.resolve({
                    data: [
                        {
                            id: 'card-1',
                            name: 'Nubank',
                            lastDigits: '1234',
                            storeId: 'store-1',
                        },
                    ],
                });
            }

            return Promise.resolve({ data: [] });
        });

        apiPost.mockImplementation((url: string) => {
            if (url === '/suppliers/find-or-create') {
                return Promise.resolve({ data: { id: 'supplier-3' } });
            }

            if (url === '/purchases') {
                return Promise.resolve({ data: { id: 'purchase-3' } });
            }

            return Promise.resolve({ data: {} });
        });

        render(<NewPurchasePage />);

        await screen.findByText('Continuar');

        const categorySelect = document.querySelector(
            '[data-tour="purchase-category"]',
        ) as HTMLSelectElement;
        fireEvent.change(categorySelect, { target: { value: 'AVULSA_CARD' } });

        fireEvent.change(
            screen.getByPlaceholderText('Ex.: Pedido semanal de carnes'),
            { target: { value: 'Compra avulsa de gelo' } },
        );

        const cardField = await screen.findByPlaceholderText(
            'Selecione o cartão',
        );
        await user.click(cardField);
        await user.click(screen.getByText('Nubank • final 1234'));

        await user.click(screen.getByText('Cadastro simplificado'));

        fireEvent.change(screen.getByPlaceholderText('0,00'), {
            target: { value: '80,00' },
        });

        await user.click(screen.getByText('Continuar'));

        await screen.findByText('Revisão da compra');
        await user.click(screen.getByText('Confirmar compra'));

        await waitFor(() => {
            expect(apiPost).toHaveBeenCalledWith(
                '/purchases',
                expect.objectContaining({
                    cardId: 'card-1',
                    method: 'CREDIT_CARD',
                    category: 'AVULSA_CARD',
                    origin: 'STORE_COUNTER',
                }),
            );
        });
    });
});
