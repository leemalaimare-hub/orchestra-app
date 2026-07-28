'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Mail, Users, Settings, X, CalendarDays, Clock, FileText, Pencil, BookMarked } from 'lucide-react';

const emailSubNav = [
  { href: '/dashboard/email/compose', label: 'Compose New Message', icon: Pencil },
  { href: '/dashboard/email/drafts',  label: 'Drafts', icon: BookMarked },
  { href: '/dashboard/email/sent',    label: 'Sent', icon: Clock },
  { href: '/dashboard/templates',     label: 'Templates', icon: FileText },
];

const concertsSubNav = [
  { href: '/dashboard/concerts',     label: 'All Concerts' },
  { href: '/dashboard/concerts/new', label: 'New Concert' },
];

const contactsSubNav = [
  { href: '/dashboard/musicians', label: 'All Contacts' },
  { href: '/dashboard/groups',    label: 'Groups' },
  { href: '/dashboard/positions', label: 'Positions' },
];

const settingsSubNav = [
  { href: '/dashboard/settings/organization', label: 'Organization' },
  { href: '/dashboard/settings/managers',     label: 'Managers' },
  { href: '/dashboard/settings/email',        label: 'Email' },
  { href: '/dashboard/settings/notifications',label: 'Notifications' },
  { href: '/dashboard/pay-rates',             label: 'Pay Rates' },
  { href: '/dashboard/settings/billing',      label: 'Billing' },
  { href: '/dashboard/settings/activity',     label: 'Activity' },
];

function SubNav({ items, onClose, isActive }: {
  items: { href: string; label: string }[];
  onClose: () => void;
  isActive: (href: string) => boolean;
}) {
  return (
    <div className="ml-7 mt-0.5 flex flex-col gap-0.5 border-l border-slate-200 pl-3">
      {items.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          onClick={onClose}
          className={`rounded-md px-2 py-1.5 text-sm transition-colors ${
            isActive(href)
              ? 'font-medium text-indigo-700'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  const inEmail    = pathname.startsWith('/dashboard/email') ||
                     pathname.startsWith('/dashboard/templates');
  const inConcerts = pathname.startsWith('/dashboard/concerts');
  const inContacts = pathname.startsWith('/dashboard/musicians') ||
                     pathname.startsWith('/dashboard/groups') ||
                     pathname.startsWith('/dashboard/positions');
  const inSettings = pathname.startsWith('/dashboard/settings') || pathname.startsWith('/dashboard/pay-rates');

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 transform border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <span className="text-lg font-bold text-indigo-600">Callscade</span>
          <button className="lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 p-3">

          {/* Dashboard */}
          <Link
            href="/dashboard"
            onClick={onClose}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
              pathname === '/dashboard'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Home className="h-4 w-4" />
            Dashboard
          </Link>

          {/* Email section */}
          <Link
            href="/dashboard/email"
            onClick={onClose}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
              inEmail ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Mail className="h-4 w-4" />
            Email
          </Link>
          {inEmail && (
            <SubNav items={emailSubNav} onClose={onClose} isActive={isActive} />
          )}

          {/* Concerts section */}
          <Link
            href="/dashboard/concerts"
            onClick={onClose}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
              inConcerts ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            Concerts
          </Link>
          {inConcerts && (
            <SubNav items={concertsSubNav} onClose={onClose} isActive={isActive} />
          )}

          {/* Contacts section */}
          <Link
            href="/dashboard/musicians"
            onClick={onClose}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
              inContacts ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Users className="h-4 w-4" />
            Contacts
          </Link>
          {inContacts && (
            <SubNav items={contactsSubNav} onClose={onClose} isActive={isActive} />
          )}

          {/* Settings section */}
          <Link
            href="/dashboard/settings/organization"
            onClick={onClose}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
              inSettings ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          {inSettings && (
            <SubNav items={settingsSubNav} onClose={onClose} isActive={isActive} />
          )}
        </nav>
      </aside>
    </>
  );
}
