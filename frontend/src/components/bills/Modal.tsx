'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// =============================================================================
// Fundo de modal padrão do sistema. Fecha SÓ com:
//   • Esc (só o modal que está por cima, se tiver mais de um aberto);
//   • clique no fundo que COMEÇOU e TERMINOU no fundo.
// Assim, selecionar um texto arrastando o mouse e soltar fora da caixa (ou
// apertar Backspace/Delete pra apagar) nunca fecha o modal.
// =============================================================================

const pilha: number[] = [];
let proximoId = 1;

export function Modal({ onFechar, children, className = 'z-50 bg-black/50' }: {
    onFechar: () => void;
    children: ReactNode;
    className?: string;
}) {
    const idRef = useRef(0);
    const fecharRef = useRef(onFechar);
    const comecouNoFundo = useRef(false);
    useEffect(() => { fecharRef.current = onFechar; }, [onFechar]);

    useEffect(() => {
        const id = proximoId++;
        idRef.current = id;
        pilha.push(id);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && pilha[pilha.length - 1] === id) {
                e.preventDefault();
                fecharRef.current();
            }
        };
        window.addEventListener('keydown', onKey);
        const overflowAnterior = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            const i = pilha.indexOf(id);
            if (i >= 0) pilha.splice(i, 1);
            if (pilha.length === 0) document.body.style.overflow = overflowAnterior;
        };
    }, []);

    return (
        <div
            className={`fixed inset-0 !m-0 flex items-center justify-center p-4 ${className}`}
            onMouseDown={(e) => { comecouNoFundo.current = e.target === e.currentTarget; }}
            onClick={(e) => {
                if (comecouNoFundo.current && e.target === e.currentTarget) fecharRef.current();
                comecouNoFundo.current = false;
            }}
        >
            {children}
        </div>
    );
}
