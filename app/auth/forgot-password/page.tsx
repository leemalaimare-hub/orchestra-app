'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { createBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email }: FormData) => {
    setSubmitting(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) { toast.error(error.message); return; }
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow">
        <h1 className="text-2xl font-bold text-slate-900">Reset password</h1>
        {sent ? (
          <p className="mt-4 rounded-md bg-green-50 p-4 text-sm text-green-800">
            Check your email for a reset link.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600">Enter your email and we&apos;ll send you a reset link.</p>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <Input label="Email" type="email" {...register('email')} error={errors.email?.message} />
              <Button type="submit" loading={submitting} className="w-full" size="lg">Send Reset Link</Button>
            </form>
          </>
        )}
        <p className="mt-6 text-center text-sm text-slate-600">
          <Link href="/auth/login" className="font-medium text-indigo-600 hover:text-indigo-700">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
