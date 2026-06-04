// Server-only Supabase clients. NEVER import from client components.
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server component / Route handler client. Reads the session from cookies.
export const createServerClient = () => {
  const store = cookies();

  // Build a cookie-based storage adapter for the server side
  const serverCookieStorage = {
    getItem(key: string): string | null {
      return store.get(key)?.value ?? null;
    },
    setItem(_key: string, _value: string): void {
      // Can't reliably set cookies in RSC — session refresh happens client-side
    },
    removeItem(_key: string): void {
      // Same — no-op in RSC
    },
  };

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      storage: serverCookieStorage,
    },
  });
};

// Service-role client for privileged server-side ops. Bypasses RLS.
export const createAdminClient = () =>
  createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
