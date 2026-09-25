'use client';

import { useState } from 'react';

import { api } from '@/lib/api';

import Cookies from 'js-cookie';

import { useRouter } from 'next/navigation';

import { Loader2 } from 'lucide-react';

import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();

  // Antes vinha pré-preenchido com uma credencial de teste antiga — como a
  // página agora recebe gente de fora vinda do /demo (e é pública), campo
  // vazio é mais seguro e menos confuso (ninguém tenta entrar sem querer
  // com um login que não é o dela).
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    try {
      setLoading(true);

      const response = await api.post('/auth/login', {
        email,
        password,
      });

      Cookies.set('token', response.data.access_token);

      Cookies.set(
        'user',
        JSON.stringify(response.data.user),
      );

      toast.success('Login realizado');

      router.push('/home');
    } catch {
      toast.error('Login inválido');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-2xl">
        <div className="mb-8">
          <img
            src="/logo-galho-hub.png"
            alt="Galho Hub"
            className="h-16 w-auto rounded-xl"
          />

          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            Gestão de compras, notas fiscais, tarefas e perdas
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="space-y-4"
        >
          <div>
            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
              E-mail
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none transition focus:border-blue-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
              Senha
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none transition focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-500 font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              'Entrar'
            )}
          </button>

          <button
            type="button"
            onClick={() => router.push('/demo')}
            className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold text-zinc-700 dark:text-zinc-300 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Cadastre-se para teste
          </button>
        </form>
      </div>
    </main>
  );
}
