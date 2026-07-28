'use client';

import Link from 'next/link';

export function TemplateTypeTabs({ active }: { active: 'email' | 'concert' }) {
  const tabs = [
    { key: 'email', label: 'Email Templates', href: '/dashboard/templates' },
    { key: 'concert', label: 'Concert Templates', href: '/dashboard/templates/concerts' },
  ] as const;
  return (
    <div className="mb-5 flex gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`px-3 py-2 text-sm font-medium ${
            active === t.key ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
