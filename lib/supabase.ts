// Browser-safe Supabase client. Safe to import from "use client" components.
import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';

export const createBrowserClient = () =>
  createSSRBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
