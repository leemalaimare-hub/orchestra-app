// Browser-safe Supabase client. Safe to import from "use client" components.
import { createClient } from '@supabase/supabase-js';

export const createBrowserClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        storageKey: 'sb-session',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    }
  );
