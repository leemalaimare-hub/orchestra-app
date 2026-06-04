'use client';

import Link from 'next/link';

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
          <span className="text-2xl">🚀</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Coming Soon</h1>
        <p className="mt-3 text-sm text-slate-500">
          Callscade is currently in private beta.<br />
          We&apos;re putting the finishing touches on things.
        </p>
        <p className="mt-4 text-sm text-slate-500">
          Want early access?{' '}
          <a
            href="mailto:hello@callscade.com"
            className="font-medium text-indigo-600 hover:text-indigo-700"
          >
            Get in touch
          </a>
        </p>
        <div className="mt-8 border-t border-slate-100 pt-6">
          <p className="text-sm text-slate-400">
            Already have an account?{' '}
            <Link href="/auth/login" className="font-medium text-indigo-600 hover:text-indigo-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
