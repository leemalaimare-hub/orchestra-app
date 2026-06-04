'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { createBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

function LoginForm() {
  const params = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async ({ email, password }: FormData) => {
    setSubmitting(true);
    setAuthError(null);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = /invalid/i.test(error.message) ? 'Invalid email or password' : error.message;
        setAuthError(msg);
        toast.error(msg);
        return;
      }
      const next = params.get('next') || '/dashboard';
      // Full reload so the session cookie is sent with the next request
      window.location.href = next;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error — please try again';
      console.error('[login] sign-in threw:', err);
      setAuthError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
      {authError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {authError}
        </div>
      )}
      <Input label="Email" type="email" {...register('email')} error={errors.email?.message} />
      <Input label="Password" type="password" {...register('password')} error={errors.password?.message} />
      <div className="flex justify-end">
        <Link href="/auth/forgot-password" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" loading={submitting} className="w-full" size="lg">Sign In</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow">
        <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-600">Welcome back.</p>
        <Suspense fallback={<div className="mt-6 h-32" />}>
          <LoginForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-slate-600">
          No account yet?{' '}
          <Link href="/auth/signup" className="font-medium text-indigo-600 hover:text-indigo-700">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
