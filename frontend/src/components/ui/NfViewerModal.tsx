'use client';

import { useEffect, useState } from 'react';
import { api, API_URL } from '@/lib/api';
import { ExternalLink, FileWarning, Landmark, Loader2, X } from 'lucide-react';

type NfeAddress = {
    logradouro?: string;
    numero?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
};

type NfeViewItem = {
    numero?: string;
    descricao?: string;
    ncm?: string;
    cfop?: string;
    quantidade?: number;
    unidade?: string;
    valorUnitario?: number;
    valorTotal?: number;
};

type NfeView = {
    chaveAcesso: string;
    tipoDocumento?: string;
    naturezaOperacao?: string;
    issueDate?: string;
    situacao?: string;
    emitente: { nome?: string; cnpj?: string; endereco?: NfeAddress };
    destinatario: {
        nome?: string;
        cnpj?: string;
        cpf?: string;
        endereco?: NfeAddress;
    };
    itens: NfeViewItem[];
    totais: {
        valorProdutos?: number;
        valorDesconto?: number;
        valorFrete?: number;
        valorSeguro?: number;
        valorOutrasDespesas?: number;
        valorTotal?: number;
        valorICMS?: number;
        valorIPI?: number;
        valorPIS?: number;
        valorCOFINS?: number;
    };
    detalhamentoCompleto: boolean;
};

type NfseParty = {
    nome?: string;
    cnpj?: string;
    cpf?: string;
    inscricaoMunicipal?: string;
    email?: string;
    endereco?: NfeAddress;
};

type NfseView = {
    numeroNf?: string;
    issueDate?: string;
    competencia?: string;
    prestador: NfseParty;
    tomador: NfseParty;
    servico: {
        descricao?: string;
        codigoTributacaoNacional?: string;
        codigoTributacaoMunicipal?: string;
    };
    valores: {
        valorServico?: number;
        baseCalculo?: number;
        aliquota?: number;
        valorISS?: number;
        valorLiquido?: number;
        issRetido?: boolean;
    };
    detalhamentoCompleto: boolean;
};

type ViewResponse = {
    source: 'xml' | 'resumo' | 'arquivo' | 'nenhum';
    resumo: Record<string, any> | null;
    nf: NfeView | NfseView | null;
};

type NfViewerModalProps = {
    title: string;
    viewUrl: string;
    onClose: () => void;
};

function formatCurrency(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === '') return '—';
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatDate(value?: string | null) {
    if (!value) return '—';
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.toLocaleDateString('pt-BR');
}

function formatPercent(value?: number | null) {
    if (value === null || value === undefined) return '—';
    return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function formatAddress(address?: NfeAddress) {
    if (!address) return null;
    const line1 = [address.logradouro, address.numero].filter(Boolean).join(', ');
    const line2 = [address.bairro, address.municipio, address.uf].filter(Boolean).join(' - ');
    const parts = [line1, line2, address.cep ? `CEP ${address.cep}` : null].filter(Boolean);
    return parts.length > 0 ? parts.join(' • ') : null;
}

function isNfeView(nf: NfeView | NfseView): nf is NfeView {
    return 'emitente' in nf;
}

function Field({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null;
    return (
        <div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
            <p className="text-sm text-zinc-800 dark:text-zinc-200">{value}</p>
        </div>
    );
}

// Tela de "resumo legível" pra qualquer NF (entrada, saída ou serviço) —
// busca no endpoint /view (parse do XML sob demanda) e monta uma leitura
// organizada em vez do XML cru. Detecta sozinho se o retorno é de NF de
// mercadoria (emitente/destinatario/itens) ou de serviço
// (prestador/tomador/valores) pra desenhar a seção certa.
export function NfViewerModal({ title, viewUrl, onClose }: NfViewerModalProps) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ViewResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);

            try {
                const response = await api.get(viewUrl);
                if (!cancelled) setData(response.data);
            } catch {
                if (!cancelled) setError('Não foi possível carregar os dados dessa NF.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [viewUrl]);

    // Fecha com ESC, igual qualquer modal padrão.
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose();
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={(event) => {
                // Só fecha se o clique foi no fundo (backdrop) em si, não em
                // algo dentro do card — senão qualquer clique no conteúdo
                // fecharia o modal.
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl">
                <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <h2 className="text-lg font-bold">{title}</h2>
                    <button
                        onClick={onClose}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5">
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-zinc-500">
                            <Loader2 size={18} className="animate-spin" />
                            Carregando...
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center text-zinc-500">
                            <FileWarning size={24} />
                            {error}
                        </div>
                    ) : !data || data.source === 'nenhum' ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center text-zinc-500">
                            <FileWarning size={24} />
                            Nenhuma NF anexada a esse registro.
                        </div>
                    ) : data.source === 'arquivo' ? (
                        <div className="space-y-3 text-center">
                            <FileWarning size={24} className="mx-auto text-zinc-500" />
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                O arquivo anexado não é um XML — não dá pra montar um resumo.
                                Abra o arquivo original abaixo.
                            </p>
                            {data.resumo?.fileUrl && (
                                <a
                                    href={`${API_URL}${data.resumo.fileUrl}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
                                >
                                    <ExternalLink size={16} />
                                    Abrir arquivo
                                </a>
                            )}
                        </div>
                    ) : data.nf && isNfeView(data.nf) ? (
                        <GoodsNfView nf={data.nf} />
                    ) : data.nf ? (
                        <ServiceNfView nf={data.nf as NfseView} />
                    ) : (
                        <ResumoOnlyView resumo={data.resumo} />
                    )}
                </div>
            </div>
        </div>
    );
}

function ResumoOnlyView({ resumo }: { resumo: Record<string, any> | null }) {
    if (!resumo) return null;

    return (
        <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Essa NF só tem o resumo capturado automaticamente — sem itens ou detalhamento
                completo (o XML integral não estava disponível).
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Empresa" value={resumo.issuerName || resumo.recipientName} />
                <Field
                    label="CNPJ/CPF"
                    value={resumo.issuerCnpj || resumo.issuerDoc || resumo.recipientCnpj}
                />
                <Field label="Valor" value={formatCurrency(resumo.value)} />
                <Field label="Data de emissão" value={formatDate(resumo.issueDate)} />
                <Field label="Situação" value={resumo.situacao} />
                <Field label="Chave de acesso" value={resumo.chaveAcesso} />
            </div>
        </div>
    );
}

function GoodsNfView({ nf }: { nf: NfeView }) {
    const emitAddress = formatAddress(nf.emitente.endereco);
    const destAddress = formatAddress(nf.destinatario.endereco);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
                {nf.situacao && (
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-500">
                        {nf.situacao}
                    </span>
                )}
                {nf.naturezaOperacao && (
                    <span className="rounded-full bg-zinc-500/10 px-2.5 py-1 text-xs font-medium text-zinc-500">
                        {nf.naturezaOperacao}
                    </span>
                )}
                {!nf.detalhamentoCompleto && (
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500">
                        Só resumo — sem itens detalhados
                    </span>
                )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Emitente</p>
                    <Field label="Nome" value={nf.emitente.nome} />
                    <Field label="CNPJ" value={nf.emitente.cnpj} />
                    <Field label="Endereço" value={emitAddress || undefined} />
                </div>

                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">
                        Destinatário
                    </p>
                    <Field label="Nome" value={nf.destinatario.nome} />
                    <Field label="CNPJ/CPF" value={nf.destinatario.cnpj || nf.destinatario.cpf} />
                    <Field label="Endereço" value={destAddress || undefined} />
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Data de emissão" value={formatDate(nf.issueDate)} />
                <Field label="Chave de acesso" value={nf.chaveAcesso} />
                <Field label="Tipo" value={nf.tipoDocumento === '65' ? 'NFC-e' : 'NF-e'} />
            </div>

            {nf.itens.length > 0 && (
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Itens</p>
                    <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
                        <table className="w-full text-sm">
                            <thead className="bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-500">
                                <tr>
                                    <th className="p-2 text-left">Item</th>
                                    <th className="p-2 text-right">Qtd</th>
                                    <th className="p-2 text-right">Vl. unit.</th>
                                    <th className="p-2 text-right">Vl. total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {nf.itens.map((item, index) => (
                                    <tr
                                        key={index}
                                        className="border-t border-zinc-100 dark:border-zinc-800"
                                    >
                                        <td className="p-2">
                                            {item.descricao || 'Item sem descrição'}
                                            {item.unidade ? (
                                                <span className="text-zinc-500"> ({item.unidade})</span>
                                            ) : null}
                                        </td>
                                        <td className="p-2 text-right">{item.quantidade ?? '—'}</td>
                                        <td className="p-2 text-right">
                                            {formatCurrency(item.valorUnitario)}
                                        </td>
                                        <td className="p-2 text-right font-medium">
                                            {formatCurrency(item.valorTotal)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <TaxHighlightBox
                items={[
                    { label: 'ICMS', value: formatCurrency(nf.totais.valorICMS) },
                    { label: 'IPI', value: formatCurrency(nf.totais.valorIPI) },
                    { label: 'PIS', value: formatCurrency(nf.totais.valorPIS) },
                    { label: 'COFINS', value: formatCurrency(nf.totais.valorCOFINS) },
                ]}
                note="Crédito de ICMS por mercadoria pra revenda costuma ser direto. Crédito de PIS/COFINS (Lucro Real) depende do item ser insumo, aluguel de PJ, frete ou manutenção — mão de obra de pessoa física não gera crédito. Confirme com seu contador antes de lançar."
            />

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Valores</p>
                <div className="grid gap-2 sm:grid-cols-3">
                    <Field label="Produtos" value={formatCurrency(nf.totais.valorProdutos)} />
                    <Field label="Desconto" value={formatCurrency(nf.totais.valorDesconto)} />
                    <Field label="Frete" value={formatCurrency(nf.totais.valorFrete)} />
                </div>
                <p className="mt-3 text-xl font-bold text-orange-400">
                    {formatCurrency(nf.totais.valorTotal)}
                </p>
            </div>
        </div>
    );
}

function TaxHighlightBox({
    items,
    note,
}: {
    items: { label: string; value?: string }[];
    note: string;
}) {
    return (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3">
            <div className="mb-2 flex items-center gap-2">
                <Landmark size={16} className="text-blue-500" />
                <p className="text-xs font-semibold uppercase text-blue-500">
                    Impostos e possível crédito
                </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
                {items.map((item) => (
                    <Field key={item.label} label={item.label} value={item.value} />
                ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">{note}</p>
        </div>
    );
}

function ServiceNfView({ nf }: { nf: NfseView }) {
    const prestAddress = formatAddress(nf.prestador.endereco);
    const tomaAddress = formatAddress(nf.tomador.endereco);

    return (
        <div className="space-y-5">
            {!nf.detalhamentoCompleto && (
                <span className="inline-block rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500">
                    Detalhamento parcial — alguns campos podem não ter sido encontrados no XML.
                </span>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Prestador</p>
                    <Field label="Nome" value={nf.prestador.nome} />
                    <Field label="CNPJ/CPF" value={nf.prestador.cnpj || nf.prestador.cpf} />
                    <Field label="Inscrição municipal" value={nf.prestador.inscricaoMunicipal} />
                    <Field label="E-mail" value={nf.prestador.email} />
                    <Field label="Endereço" value={prestAddress || undefined} />
                </div>

                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Tomador</p>
                    <Field label="Nome" value={nf.tomador.nome} />
                    <Field label="CNPJ/CPF" value={nf.tomador.cnpj || nf.tomador.cpf} />
                    <Field label="Endereço" value={tomaAddress || undefined} />
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Número da NF" value={nf.numeroNf} />
                <Field label="Data de emissão" value={formatDate(nf.issueDate)} />
            </div>

            {nf.servico.descricao && (
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">
                        Descrição do serviço
                    </p>
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">
                        {nf.servico.descricao}
                    </p>
                </div>
            )}

            <TaxHighlightBox
                items={[
                    { label: 'Base de cálculo', value: formatCurrency(nf.valores.baseCalculo) },
                    { label: 'Alíquota ISS', value: formatPercent(nf.valores.aliquota) },
                    { label: 'Valor do ISS', value: formatCurrency(nf.valores.valorISS) },
                    {
                        label: 'ISS retido',
                        value:
                            nf.valores.issRetido === undefined
                                ? '—'
                                : nf.valores.issRetido
                                    ? 'Sim'
                                    : 'Não',
                    },
                ]}
                note="O ISS em si não gera crédito de ICMS nem de PIS/COFINS. Mas o valor da nota pode gerar crédito de PIS/COFINS (Lucro Real) se o serviço for insumo — limpeza, segurança, manutenção, frete — desde que prestado por pessoa jurídica. Confirme com seu contador antes de lançar."
            />

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Valores</p>
                <Field label="Valor líquido" value={formatCurrency(nf.valores.valorLiquido)} />
                <p className="mt-3 text-xl font-bold text-orange-400">
                    {formatCurrency(nf.valores.valorServico)}
                </p>
            </div>
        </div>
    );
}
