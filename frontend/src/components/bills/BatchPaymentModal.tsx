'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';

type Config = {
    id?: string;
    convenioCode: string;
    agencia: string;
    agenciaDv: string;
    conta: string;
    contaDv: string;
    companyName: string;
    companyCnpj: string;
};

const CONFIG_VAZIA: Config = {
    convenioCode: '',
    agencia: '',
    agenciaDv: '',
    conta: '',
    contaDv: '',
    companyName: '',
    companyCnpj: '',
};

// Tela de configuração do convênio de pagamentos no Sicredi — dado usado
// só pra montar o cabeçalho do arquivo CNAB 240 (ver
// cnab240-sicredi-builder.ts no backend). Único registro pra empresa
// toda (não muda por loja).
export function BatchPaymentModal({ onClose }: { onClose: () => void }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState<Config>(CONFIG_VAZIA);

    useEffect(() => {
        async function carregar() {
            try {
                setLoading(true);

                const response = await api.get('/bills/batch-payment/config');
                const data = response.data;

                if (data) {
                    setConfig({
                        id: data.id,
                        convenioCode: data.convenioCode || '',
                        agencia: data.agencia || '',
                        agenciaDv: data.agenciaDv || '',
                        conta: data.conta || '',
                        contaDv: data.contaDv || '',
                        companyName: data.companyName || '',
                        companyCnpj: data.companyCnpj || '',
                    });
                }
            } catch (error: any) {
                toast.error(
                    error?.response?.data?.message ||
                    'Erro ao carregar a configuração do convênio.',
                );
            } finally {
                setLoading(false);
            }
        }

        carregar();
    }, []);

    function atualizar(campo: keyof Config, valor: string) {
        setConfig((current) => ({ ...current, [campo]: valor }));
    }

    async function salvar() {
        if (
            !config.convenioCode ||
            !config.agencia ||
            !config.conta ||
            !config.companyName ||
            !config.companyCnpj
        ) {
            toast.error(
                'Preencha código do convênio, agência, conta, nome da empresa e CNPJ.',
            );
            return;
        }

        try {
            setSaving(true);

            await api.put('/bills/batch-payment/config', {
                convenioCode: config.convenioCode,
                agencia: config.agencia,
                agenciaDv: config.agenciaDv || undefined,
                conta: config.conta,
                contaDv: config.contaDv || undefined,
                companyName: config.companyName,
                companyCnpj: config.companyCnpj,
            });

            toast.success('Convênio do Sicredi salvo.');
            onClose();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao salvar a configuração do convênio.',
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 dark:bg-zinc-900">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-zinc-500">Contas a Pagar</p>
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                            Convênio Sicredi
                        </h3>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <X size={18} />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-10 text-zinc-500">
                        <Loader2 size={22} className="animate-spin" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                            Único convênio pra todas as lojas — usado só pra
                            montar o cabeçalho do arquivo que você sobe no
                            Sicredi. Confira esses dados com seu gerente antes
                            de usar de verdade.
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                    Código do convênio
                                </label>
                                <input
                                    value={config.convenioCode}
                                    onChange={(e) =>
                                        atualizar('convenioCode', e.target.value)
                                    }
                                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                                    placeholder="Código do Convênio de Pagamentos"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                    Agência
                                </label>
                                <input
                                    value={config.agencia}
                                    onChange={(e) =>
                                        atualizar('agencia', e.target.value)
                                    }
                                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                                    placeholder="0000"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                    Dígito da agência
                                </label>
                                <input
                                    value={config.agenciaDv}
                                    onChange={(e) =>
                                        atualizar('agenciaDv', e.target.value)
                                    }
                                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                                    placeholder="Opcional"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                    Conta
                                </label>
                                <input
                                    value={config.conta}
                                    onChange={(e) =>
                                        atualizar('conta', e.target.value)
                                    }
                                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                                    placeholder="00000000"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                    Dígito da conta
                                </label>
                                <input
                                    value={config.contaDv}
                                    onChange={(e) =>
                                        atualizar('contaDv', e.target.value)
                                    }
                                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                                    placeholder="Opcional"
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                    Nome da empresa
                                </label>
                                <input
                                    value={config.companyName}
                                    onChange={(e) =>
                                        atualizar('companyName', e.target.value)
                                    }
                                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                                    placeholder="Razão social"
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                    CNPJ
                                </label>
                                <input
                                    value={config.companyCnpj}
                                    onChange={(e) =>
                                        atualizar('companyCnpj', e.target.value)
                                    }
                                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                                    placeholder="00.000.000/0000-00"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                onClick={salvar}
                                disabled={saving}
                                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                                {saving ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Modal de confirmação/resumo depois de gerar o arquivo — mostra quantos
// boletos/PIX entraram e quais ficaram de fora (e por quê), já que o
// arquivo é baixado automaticamente junto.
export function BatchPaymentSummaryModal({
    resumo,
    onClose,
}: {
    resumo: {
        totalBoletos: number;
        totalPix: number;
        ignoradas: { id: string; description: string; motivo: string }[];
    };
    onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 dark:bg-zinc-900">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                        Arquivo gerado
                    </h3>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-3 text-sm">
                    <p className="text-zinc-700 dark:text-zinc-300">
                        {resumo.totalBoletos} boleto(s) e{' '}
                        {resumo.totalPix} PIX incluídos no arquivo baixado.
                    </p>

                    <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        Confira o arquivo com o Sicredi antes de aprovar o
                        lote de verdade — o layout segue o padrão FEBRABAN,
                        mas alguns detalhes (principalmente do PIX) podem
                        precisar de ajuste conforme o manual do banco.
                    </p>

                    {resumo.ignoradas.length > 0 && (
                        <div>
                            <p className="mb-1 font-semibold text-zinc-700 dark:text-zinc-300">
                                Ficaram de fora ({resumo.ignoradas.length}):
                            </p>

                            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-zinc-200 p-2 dark:border-zinc-700">
                                {resumo.ignoradas.map((item) => (
                                    <li
                                        key={item.id}
                                        className="text-xs text-zinc-600 dark:text-zinc-400"
                                    >
                                        <span className="font-medium">
                                            {item.description}
                                        </span>{' '}
                                        — {item.motivo}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="mt-4 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                        Entendi
                    </button>
                </div>
            </div>
        </div>
    );
}
