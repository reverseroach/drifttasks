import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default function proxy(request: NextRequest) {
    const path = request.nextUrl.pathname;

    const isPublicPath = path === '/login' || path === '/';

    // TODO: Will improve this later with proper Firebase token checking
    const token = request.cookies.get('firebase-auth-token')?.value;

    // Redirect unauthenticated users to login
    if (!token && !isPublicPath) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Redirect logged-in users away from login page
    if (token && path === '/login') {
        return NextResponse.redirect(new URL('/today', request.url));
    }

    return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};