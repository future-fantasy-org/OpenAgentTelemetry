import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PREFIXES = ['/login'];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = req.cookies.get('oat_session')?.value;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (session && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (!session && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set('x-search', search);
  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
