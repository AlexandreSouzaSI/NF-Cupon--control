import withPWA from 'next-pwa';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Gera uma build "standalone" (server.js + só os node_modules usados),
  // essencial pra manter a imagem Docker pequena em hospedagem free.
  output: 'standalone',
};

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // Injeta o listener de push (public/push-sw.js) dentro do service worker
  // principal que o workbox gera — precisa ser assim (em vez de registrar
  // um segundo service worker) porque só um SW pode controlar a mesma
  // scope de uma vez.
  // "as any" só nessa chave: o pacote @types do next-pwa 5.6 não declara
  // "importScripts" no tipo PWAConfig, mas o workbox-webpack-plugin por
  // baixo aceita e usa essa opção normalmente em tempo de execução — é só
  // o typing que está desatualizado.
  importScripts: ['/push-sw.js'],
} as any)(nextConfig);