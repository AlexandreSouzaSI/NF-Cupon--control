'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Loader2, Paperclip, Upload } from 'lucide-react';

import { BillCategorySelect, type BillCategory } from '../../../src/components/bills/BillCategorySelect';
import { api } from '@/lib/api';
import { MoneyInput } from '../../../src/components/ui/MoneyInput';

// Página PÚBLICA (sem login) do link secreto da loja: o proprietário anexa o
// comprovante (ou informa valor/fornecedor) e envia ao financeiro.

const campo = 'w-full px-3 py-3 rounded-xl text-base bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400';
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AvisarPagamentoPage() {
    const params = useParams();
    const token = String(params?.token ?? '');
    const [loja, setLoja] = useState<string | null>(null);
    const [invalido, setInvalido] = useState(false);
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [fornecedor, setFornecedor] = useState('');
    const [valor, setValor] = useState('');
    const [descricao, setDescricao] = useState('');
    const [categorias, setCategorias] = useState<BillCategory[]>([]);
    const [categoryId, setCategoryId] = useState('');
    const [maisDados, setMaisDados] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);

    useEffect(() => {
        api.get(`/publico/avisar/${token}`)
            .then((r) => { setLoja(r.data.loja); setCategorias(r.data.categorias ?? []); })
            .catch(() => setInvalido(true));
    }, [token]);

    async function enviar(e: React.FormEvent) {
        e.preventDefault();
        setErro(null);
        setEnviando(true);
        try {
            const fd = new FormData();
            if (arquivo) fd.append('file', arquivo);
            if (fornecedor.trim()) fd.append('fornecedor', fornecedor.trim());
            if (valor.trim()) fd.append('valor', valor.trim());
            if (descricao.trim()) fd.append('descricao', descricao.trim());
            if (categoryId) fd.append('categoryId', categoryId);
            const r = await api.post(`/publico/avisar/${token}`, fd);
            setOk([r.data.fornecedor, r.data.valor ? moeda(r.data.valor) : null].filter(Boolean).join(' — ') || 'Comprovante recebido.');
            setArquivo(null); setFornecedor(''); setValor(''); setDescricao(''); setCategoryId('');
        } catch (err: any) {
            setErro(err?.response?.data?.message ?? 'Não foi possível enviar.');
        } finally {
            setEnviando(false);
        }
    }

    if (invalido) {
        return <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 text-gray-600 text-center">Link inválido ou desativado. Peça um novo ao financeiro.</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4">
            <div className="w-full max-w-md space-y-4 pt-6">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Avisar pagamento</h1>
                    <p className="text-sm text-gray-500">{loja ?? 'Carregando...'}</p>
                </div>

                {ok ? (
                    <div className="bg-white rounded-2xl border border-green-200 p-6 text-center space-y-3">
                        <CheckCircle2 className="mx-auto text-green-600" size={40} />
                        <p className="font-semibold text-gray-900">Enviado ao financeiro</p>
                        <p className="text-sm text-gray-500">{ok}</p>
                        <button onClick={() => setOk(null)} className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold">Enviar outro</button>
                    </div>
                ) : (
                    <form onSubmit={enviar} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                        <label className="flex items-center justify-center gap-2 px-3 py-6 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 text-blue-700 font-semibold cursor-pointer text-center">
                            <Paperclip size={20} />
                            {arquivo ? arquivo.name : 'Anexar comprovante (foto ou PDF)'}
                            <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                        </label>
                        {!maisDados ? (
                            <button type="button" onClick={() => setMaisDados(true)} className="w-full text-sm text-blue-600">Sem comprovante? Informar valor e fornecedor</button>
                        ) : (
                            <>
                                <input className={campo} placeholder="Fornecedor / quem recebeu" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
                                <MoneyInput className={campo} placeholder="Valor pago (R$)" value={valor} onChange={(e) => setValor(e.target.value)} />
                                <input className={campo} placeholder="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
                                <BillCategorySelect categories={categorias} value={categoryId} onChange={setCategoryId} placeholder="Categoria (opcional)" className={campo} />
                            </>
                        )}
                        {erro && <p className="text-sm text-red-600">{erro}</p>}
                        <button disabled={enviando || (!arquivo && (!fornecedor.trim() || !valor.trim()))} className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">
                            {enviando ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />} Enviar ao financeiro
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
