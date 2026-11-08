import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_ROUTES = ['/dashboard', '/studio', '/playlist', '/audiobooks', '/shorts', '/tasks', '/pexels', '/animation', '/projects', '/media', '/live'];
const SUPER_ADMIN_ROUTES = ['/admin'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if route needs authentication (join de invitados Live es público)
  const isLiveJoin = pathname === '/live/join' || pathname.startsWith('/live/join/');
  const isAdminRoute = !isLiveJoin && ADMIN_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'));
  const isSuperAdminRoute = SUPER_ADMIN_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'));
  const isPortalRoute = pathname === '/portal' || pathname.startsWith('/portal/') || pathname === '/artist-studio' || pathname.startsWith('/artist-studio/');
  const isProtectedRoute = isAdminRoute || isSuperAdminRoute || isPortalRoute;

  if (!isProtectedRoute) return NextResponse.next();

  const session = request.cookies.get('mediasuite_session');
  if (!session?.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const parts = session.value.split('.');
    if (parts.length !== 3) throw new Error('invalid');
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      const url = new URL('/login', request.url);
      url.searchParams.set('redirect', pathname);
      url.searchParams.set('reason', 'expired');
      return NextResponse.redirect(url);
    }

    const role = payload.role;

    // Super admin routes require super_admin role
    if (isSuperAdminRoute && role !== 'super_admin') {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Admin routes require admin role — clientes redirigidos a su portal
    if (isAdminRoute && !['super_admin', 'tools_admin'].includes(role)) {
      return NextResponse.redirect(new URL('/portal', request.url));
    }

    // Portal route requires any authenticated user
    if (isPortalRoute) {
      return NextResponse.next();
    }

    return NextResponse.next();
  } catch {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
