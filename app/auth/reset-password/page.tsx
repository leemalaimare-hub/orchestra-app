'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type');

    if (tokenHash && type === 'recovery') {
      // Verify the token hash with Supabase
      import('@/lib/supabase').then(({ createBrowserClient }) => {
        const supabase = createBrowserClient();
        supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
          .then(({ error }) => {
            if (error) {
              setError('This reset link is invalid or has expired. Please request a new one.');
            } else {
              setReady(true);
            }
          });
      });
    } else {
      // Fallback: listen for PASSWORD_RECOVERY event (hash-based flow)
      import('@/lib/supabase').then(({ createBrowserClient }) => {
        const supabase = createBrowserClient();
        supabase.auth.onAuthStateChange((event: string) => {
          if (event === 'PASSWORD_RECOVERY') setReady(true);
        });
      });
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }

    setLoading(true);
    setError('');

    const { createBrowserClient } = await import('@/lib/supabase');
    const supabase = createBrowserClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) { setError(err.message); return; }
    router.push('/auth/login?reset=success');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-lg font-bold text-indigo-600 mb-2">Callscade</p>
          <h1 className="text-2xl font-bold text-slate-900">Set new password</h1>
          <p className="mt-2 text-sm text-slate-500">Enter your new password below.</p>
        </div>

        {error && !ready && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-600 text-center">
            {error}
            <div className="mt-2">
              <a href="/auth/forgot-password" className="font-medium underline">Request a new reset link</a>
            </div>
          </div>
        )}

        {!ready && !error && (
          <p className="text-center text-sm text-slate-400">Verifying reset link…</p>
        )}

        {ready && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                placeholder="Repeat password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>}>
      <ResetForm />
    </Suspense>
  );
}
