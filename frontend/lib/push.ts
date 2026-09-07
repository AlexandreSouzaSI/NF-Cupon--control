import { api } from './api';

// Chave pública VAPID (não é segredo — vai no navegador). Sem ela, o botão
// de ativar notificações fica desabilitado em vez de quebrar.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

export function isPushSupported() {
    return (
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        Boolean(VAPID_PUBLIC_KEY)
    );
}

// O navegador exige a chave VAPID em Uint8Array, mas ela chega do backend
// em base64 url-safe — essa conversão é o jeito padrão de fazer isso.
function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; i += 1) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
}

export async function getPushSubscriptionStatus(): Promise<
    'unsupported' | 'denied' | 'subscribed' | 'not-subscribed'
> {
    if (!isPushSupported()) return 'unsupported';

    if (Notification.permission === 'denied') return 'denied';

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    return subscription ? 'subscribed' : 'not-subscribed';
}

// Pede permissão (se ainda não tiver) e assina o push no navegador, depois
// manda a inscrição pro backend guardar vinculada ao usuário logado.
export async function subscribeToPush() {
    if (!isPushSupported()) {
        throw new Error('Este navegador não suporta notificação push.');
    }

    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
        throw new Error('Permissão de notificação não foi concedida.');
    }

    const registration = await navigator.serviceWorker.ready;

    const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

    const json = subscription.toJSON();

    await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: json.keys,
    });

    return subscription;
}

// Cancela a assinatura no navegador e avisa o backend pra apagar o
// registro (senão fica tentando mandar push pra uma inscrição morta).
export async function unsubscribeFromPush() {
    if (!isPushSupported()) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) return;

    const endpoint = subscription.endpoint;

    await subscription.unsubscribe();

    await api.delete('/push/subscribe', { params: { endpoint } });
}
