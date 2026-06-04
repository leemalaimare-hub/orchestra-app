// Browser-safe Supabase client. Safe to import from "use client" components.
import { createClient } from '@supabase/supabase-js';

// Cookie-based storage so the middleware can read the session server-side
function makeCookieStorage() {
  return {
    getItem(key: string): string | null {
      if (typeof document === 'undefined') return null;
      const match = document.cookie.match(new RegExp('(?:^|; )' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    },
    setItem(key: string, value: string): void {
      if (typeof document === 'undefined') return;
      document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax; Secure`;
    },
    removeItem(key: string): void {
      if (typeof document === 'undefined') return;
      document.cookie = `${key}=; path=/; max-age=0`;
    },
  };
}

export const createBrowserClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        storage: makeCookieStorage(),
      },
    }
  );
