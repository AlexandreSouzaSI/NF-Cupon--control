'use client';

import { useState } from 'react';

import { api } from '@/lib/api';

import Cookies from 'js-cookie';

import { useRouter } from 'next/navigation';

import { Loader2 } from 'lucide-react';

import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('admin@compras.com');
  const [password, setPassword] = useState('123456');

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
          <h1 className="text-3xl font-bold">
            Controle Compras
          </h1>

          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Gestão de compras e notas fiscais
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
              className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none transition focus:border-green-500"
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
              className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none transition focus:border-green-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-green-500 font-semibold text-zinc-900 dark:text-white transition hover:bg-green-600 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              'Entrar'
            )}
          </button>
        </form>
      </div>
    </main>
  );
}