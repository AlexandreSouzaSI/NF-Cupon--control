import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// AppLayout puxa router/tema/menu/badges — nada disso é o que estamos
// testando aqui (é a página de aprovações). Troca por um passthrough simples
// pra não precisar mockar next/navigation, lib/theme, lib/menu etc.
vi.mock('../../src/components/app-layout', () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
}));

vi.mock('@/lib/api', () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
    },
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

import { api } from '@/lib/api';
import { toast } from 'sonner';

import ApprovalsPage from './page';

const apiGet = api.get as unknown as ReturnType<typeof vi.fn>;
const apiPost = api.post as unknown as ReturnType<typeof vi.fn>;

function pendingPurchase(overrides = {}) {
    return {
        id: 'p-1',
        description: 'Compra de bebidas',
        value: '123.45',
        method: 'PIX',
        status: 'WAITING_APPROVAL',
        createdAt: '2026-09-01T00:00:00.000Z',
        store: { name: 'Anchieta' },
        createdBy: { name: 'Fulano' },
        ...overrides,
    };
}

function rejectedPurchase(overrides = {}) {
    return {
        id: 'p-2',
        description: 'Compra de carnes',
        value: '500.00',
        method: 'BOLETO',
        status: 'REJECTED',
        createdAt: '2026-09-01T00:00:00.000Z',
        rejectionReason: 'Fora do orçamento',
        rejectedAt: '2026-09-02T00:00:00.000Z',
        store: { name: 'Contagem' },
        createdBy: { name: 'Ciclana' },
        bills: [],
        incomingGoodsNfs: [],
        approvals: [
            {
                id: 'a-1',
                status: 'REJECTED' as const,
                comment: 'Fora do orçamento',
                approver: { name: 'Gerente X' },
            },
        ],
        ...overrides,
    };
}

beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    (toast.success as ReturnType<typeof vi.fn>).mockReset();
    (toast.error as ReturnType<typeof vi.fn>).mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ApprovalsPage', () => {
    it('mostra o estado vazio quando não há pendências nem reprovadas', async () => {
        apiGet.mockResolvedValueOnce({ data: [] });

        render(<ApprovalsPage />);

        expect(
            await screen.findByText('Nenhuma aprovação pendente'),
        ).toBeInTheDocument();

        expect(
            screen.getByText('Nenhuma compra reprovada'),
        ).toBeInTheDocument();
    });

    it('lista compra pendente com valor formatado e loja/solicitante', async () => {
        apiGet.mockResolvedValueOnce({ data: [pendingPurchase()] });

        render(<ApprovalsPage />);

        expect(
            await screen.findByText('Compra de bebidas'),
        ).toBeInTheDocument();

        expect(screen.getByText('Loja: Anchieta')).toBeInTheDocument();
        expect(
            screen.getByText('Solicitado por: Fulano'),
        ).toBeInTheDocument();
        expect(screen.getByText('R$ 123,45')).toBeInTheDocument();
    });

    it('aprovar chama POST /purchases/:id/approve e recarrega a lista', async () => {
        const user = userEvent.setup();

        apiGet
            .mockResolvedValueOnce({ data: [pendingPurchase()] })
            .mockResolvedValueOnce({ data: [] });

        apiPost.mockResolvedValueOnce({ data: {} });

        render(<ApprovalsPage />);

        const approveButton = await screen.findByText('Aprovar');
        await user.click(approveButton);

        await waitFor(() => {
            expect(apiPost).toHaveBeenCalledWith(
                '/purchases/p-1/approve',
                { comment: '' },
            );
        });

        expect(toast.success).toHaveBeenCalledWith('Compra aprovada');
        await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    });

    it('reprovar cancela sem chamar a API quando o prompt é cancelado', async () => {
        const user = userEvent.setup();

        apiGet.mockResolvedValueOnce({ data: [pendingPurchase()] });
        vi.spyOn(window, 'prompt').mockReturnValue(null);

        render(<ApprovalsPage />);

        const rejectButton = await screen.findByText('Reprovar');
        await user.click(rejectButton);

        expect(apiPost).not.toHaveBeenCalled();
    });

    it('reprovar com motivo chama POST /purchases/:id/reject com o comentário', async () => {
        const user = userEvent.setup();

        apiGet
            .mockResolvedValueOnce({ data: [pendingPurchase()] })
            .mockResolvedValueOnce({ data: [] });

        apiPost.mockResolvedValueOnce({ data: {} });
        vi.spyOn(window, 'prompt').mockReturnValue('Fora do orçamento');

        render(<ApprovalsPage />);

        const rejectButton = await screen.findByText('Reprovar');
        await user.click(rejectButton);

        await waitFor(() => {
            expect(apiPost).toHaveBeenCalledWith('/purchases/p-1/reject', {
                comment: 'Fora do orçamento',
            });
        });

        expect(toast.success).toHaveBeenCalledWith('Compra reprovada');
    });

    it('mostra erro quando falha ao carregar aprovações', async () => {
        apiGet.mockRejectedValueOnce(new Error('network'));

        render(<ApprovalsPage />);

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                'Erro ao carregar aprovações',
            );
        });
    });

    it('reprovadas: exibe motivo e aprovador da última reprovação', async () => {
        apiGet.mockResolvedValueOnce({ data: [rejectedPurchase()] });

        render(<ApprovalsPage />);

        expect(
            await screen.findByText('Compra de carnes'),
        ).toBeInTheDocument();

        expect(
            screen.getByText('Reprovada por Gerente X'),
        ).toBeInTheDocument();

        expect(
            screen.getByText('Motivo: Fora do orçamento'),
        ).toBeInTheDocument();
    });

    it('reprovadas: botão Excluir só aparece sem conta/NF vinculada', async () => {
        apiGet.mockResolvedValueOnce({
            data: [
                rejectedPurchase({ id: 'p-2', bills: [], incomingGoodsNfs: [] }),
                rejectedPurchase({
                    id: 'p-3',
                    description: 'Compra com conta vinculada',
                    bills: [{ id: 'b-1' }],
                    incomingGoodsNfs: [],
                }),
            ],
        });

        render(<ApprovalsPage />);

        await screen.findByText('Compra de carnes');

        const cards = screen.getAllByText('Aprovar de novo').map(
            (button: HTMLElement) =>
                button.closest('div.rounded-3xl') as HTMLElement,
        );

        expect(
            within(cards[0]).getByText('Excluir'),
        ).toBeInTheDocument();

        expect(
            within(cards[1]).queryByText('Excluir'),
        ).not.toBeInTheDocument();
    });

    it('unreject chama POST /purchases/:id/unreject', async () => {
        const user = userEvent.setup();

        apiGet
            .mockResolvedValueOnce({ data: [rejectedPurchase()] })
            .mockResolvedValueOnce({ data: [] });

        apiPost.mockResolvedValueOnce({ data: {} });

        render(<ApprovalsPage />);

        const unrejectButton = await screen.findByText('Aprovar de novo');
        await user.click(unrejectButton);

        await waitFor(() => {
            expect(apiPost).toHaveBeenCalledWith(
                '/purchases/p-2/unreject',
                { comment: '' },
            );
        });

        expect(toast.success).toHaveBeenCalledWith(
            'Reprovação revertida — compra liberada de novo',
        );
    });

    it('excluir pede confirmação e só chama a API se confirmado', async () => {
        const user = userEvent.setup();

        apiGet.mockResolvedValueOnce({ data: [rejectedPurchase()] });
        vi.spyOn(window, 'confirm').mockReturnValue(false);

        render(<ApprovalsPage />);

        const removeButton = await screen.findByText('Excluir');
        await user.click(removeButton);

        expect(apiPost).not.toHaveBeenCalled();
    });

    it('excluir confirmado chama POST /purchases/:id/delete', async () => {
        const user = userEvent.setup();

        apiGet
            .mockResolvedValueOnce({ data: [rejectedPurchase()] })
            .mockResolvedValueOnce({ data: [] });

        apiPost.mockResolvedValueOnce({ data: {} });
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        render(<ApprovalsPage />);

        const removeButton = await screen.findByText('Excluir');
        await user.click(removeButton);

        await waitFor(() => {
            expect(apiPost).toHaveBeenCalledWith(
                '/purchases/p-2/delete',
                {},
            );
        });

        expect(toast.success).toHaveBeenCalledWith('Compra excluída');
    });
});
