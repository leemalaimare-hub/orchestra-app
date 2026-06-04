import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding');
  const isAuthRoute = pathname.startsWith('/auth');

  // Check for any Supabase session cookie
  // Supabase sets cookies with key like: sb-<ref>-auth-token or custom storage keys
  const cookies = req.cookies.getAll();
  const hasSession = cookies.some((c) => {
    if (c.value.length === 0) return false;
    // Standard Supabase cookie names
    if (c.name.startsWith('sb-') && c.name.endsWith('-auth-token')) return true;
    // Our custom cookie storage key (set by createBrowserClient)
    if (c.name.startsWith('sb-') && c.name.includes('-auth-token')) return true;
    return false;
  });

  if (isProtected && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && hasSession &&
      !pathname.startsWith('/auth/accept-invite') &&
      !pathname.startsWith('/auth/reset-password')) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/auth/:path*'],
};
