// Service worker adicional, só pra push notification (fora do app aberto).
// É incluído dentro do service worker principal (gerado pelo next-pwa/
// workbox em public/sw.js) via "importScripts" — ver next.config.ts. Por
// isso é um script clássico (sem import/export), do jeito que
// importScripts() exige.

self.addEventListener('push', function (event) {
    var data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch (error) {
        data = {
            title: 'NuGalho Hub',
            message: event.data ? event.data.text() : '',
        };
    }

    var title = data.title || 'NuGalho Hub';
    var options = {
        body: data.message || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: data.url || '/notifications' },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    var targetUrl =
        (event.notification.data && event.notification.data.url) ||
        '/notifications';

    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then(function (clientList) {
                for (var i = 0; i < clientList.length; i++) {
                    var client = clientList[i];

                    if ('focus' in client) {
                        if ('navigate' in client) {
                            client.navigate(targetUrl);
                        }

                        return client.focus();
                    }
                }

                if (self.clients.openWindow) {
                    return self.clients.openWindow(targetUrl);
                }
            }),
    );
});
