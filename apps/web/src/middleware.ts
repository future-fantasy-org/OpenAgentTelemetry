import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Edge 登录守卫：检查 cookie 存在性（Edge 不好验签，真校验在 API 层）
// 没有 oat_session cookie 就跳 /login
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // 登录页本身、静态资源放行
  if (pathname === '/login' || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }
  const session = req.cookies.get('oat_session');
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

// matcher：排除 /login 和静态资源，其余路径都过 middleware
export const config = {
  matcher: ['/((?!login|_next|favicon).*)'],
};
