'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';

export type VoicePurchaseItemDraft = {
    name: string;
    quantity: number;
    unit: string | null;
    unitPrice: number | null;
    total: number | null;
};

export type VoicePurchaseDraft = {
    description: string;
    supplierName: string | null;
    paymentMethod:
    | 'CREDIT_CARD'
    | 'CASH'
    | 'PIX'
    | 'COMPANY_ACCOUNT'
    | 'BOLETO'
    | null;
    items: VoicePurchaseItemDraft[];
    notes: string | null;
    informedTotalValue: number | null;
};

type Props = {
    onDraftReady: (result: {
        transcript: string;
        draft: VoicePurchaseDraft;
    }) => void;
    disabled?: boolean;
};

const CANDIDATE_MIME_TYPES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
];

function pickSupportedMimeType(): string | undefined {
    if (typeof MediaRecorder === 'undefined') {
        return undefined;
    }

    return CANDIDATE_MIME_TYPES.find((type) =>
        MediaRecorder.isTypeSupported(type),
    );
}

function formatElapsed(seconds: number) {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');

    return `${m}:${s}`;
}

export function VoicePurchaseButton({ onDraftReady, disabled }: Props) {
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            streamRef.current?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    function stopStream() {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }

    async function startRecording() {
        if (
            typeof navigator === 'undefined' ||
            !navigator.mediaDevices?.getUserMedia ||
            typeof MediaRecorder === 'undefined'
        ) {
            toast.error(
                'Seu navegador não suporta gravação de áudio. Tente pelo Chrome ou Edge atualizado.',
            );
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });

            streamRef.current = stream;
            chunksRef.current = [];

            const mimeType = pickSupportedMimeType();

            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);

            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            recorder.onstop = () => {
                stopStream();

                const blob = new Blob(chunksRef.current, {
                    type: recorder.mimeType || 'audio/webm',
                });

                processRecording(blob);
            };

            recorder.start();
            setRecording(true);
            setElapsed(0);

            timerRef.current = setInterval(() => {
                setElapsed((current) => current + 1);
            }, 1000);
        } catch (error: any) {
            if (error?.name === 'NotAllowedError') {
                toast.error(
                    'Permissão de microfone negada. Libere o acesso ao microfone nas configurações do navegador.',
                );
            } else if (error?.name === 'NotFoundError') {
                toast.error('Nenhum microfone encontrado neste dispositivo.');
            } else {
                toast.error(
                    'Não foi possível acessar o microfone. Se o site não estiver em HTTPS, o navegador bloqueia o acesso.',
                );
            }
        }
    }

    function stopRecording() {
        mediaRecorderRef.current?.stop();
        setRecording(false);
    }

    async function processRecording(blob: Blob) {
        if (blob.size === 0) {
            toast.error('Não foi captado nenhum áudio. Tente de novo.');
            return;
        }

        try {
            setProcessing(true);

            const formData = new FormData();
            const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';

            formData.append('audio', blob, `compra.${extension}`);

            const response = await api.post(
                '/purchases/voice-draft',
                formData,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    timeout: 60000,
                },
            );

            onDraftReady(response.data);

            toast.success(
                'Áudio interpretado — confira os dados preenchidos antes de salvar.',
            );
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao processar o áudio.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setProcessing(false);
        }
    }

    if (processing) {
        return (
            <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-500"
            >
                <Loader2 size={16} className="animate-spin" />
                Transcrevendo e preenchendo...
            </button>
        );
    }

    if (recording) {
        return (
            <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-500/20"
            >
                <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
                Parar gravação ({formatElapsed(elapsed)})
                <Square size={14} />
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={startRecording}
            disabled={disabled}
            title="Fale o fornecedor, a forma de pagamento e os itens da compra"
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
        >
            <Mic size={16} />
            Cadastrar por voz
        </button>
    );
}
