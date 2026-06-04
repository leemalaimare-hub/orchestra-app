import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;

  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding');
  const isAuthRoute = pathname.startsWith('/auth');

  // Read the Supabase session from cookies
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Get access token from cookie
  const cookieHeader = req.headers.get('cookie') ?? '';
  const hasSession = cookieHeader.includes('sb-') && cookieHeader.includes('-auth-token');

  // For a more reliable check, try to get the session via Supabase
  let isLoggedIn = false;
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          cookie: cookieHeader,
        },
      },
    });

    // Extract token from cookie
    const tokenCookie = req.cookies.getAll().find(
      (c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
    );

    if (tokenCookie) {
      try {
        const tokenData = JSON.parse(decodeURIComponent(tokenCookie.value));
        const accessToken = Array.isArray(tokenData) ? tokenData[0] : tokenData?.access_token;
        if (accessToken) {
          const { data } = await supabase.auth.getUser(accessToken);
          isLoggedIn = !!data.user;
        }
      } catch {
        isLoggedIn = hasSession;
      }
    }
  } catch {
    isLoggedIn = hasSession;
  }

  if (isProtected && !isLoggedIn) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && isLoggedIn && !pathname.startsWith('/auth/accept-invite') && !pathname.startsWith('/auth/reset-password')) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/auth/:path*'],
};
