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
  importScripts: ['/push-sw.js'],
})(nextConfig);