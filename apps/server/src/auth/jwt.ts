import { SignJWT, jwtVerify } from 'jose';

// cookie 名：oat_session
export const COOKIE_NAME = 'oat_session';
// 有效期 7 天：自托管工具，不要太短让用户频繁重登
export const MAX_AGE = 7 * 24 * 3600;

// 签名密钥：从环境变量读，启动时由 server.ts 校验非空
// jose 用 Uint8Array 密钥，TextEncoder 把字符串编码成字节
function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

export type JwtUser = { userId: string; email: string; role: string };

// 签发 token：sub=userId，载荷里放 email+role，设签发时间和过期时间
export async function signToken(user: JwtUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
}

// 校验 token：验签+过期。失败会抛 JOSEError，由调用方 catch 后返回 401
export async function verifyToken(token: string): Promise<JwtUser> {
  const { payload } = await jwtVerify(token, getSecret());
  return {
    userId: payload.sub!,
    email: payload.email as string,
    role: payload.role as string,
  };
}
