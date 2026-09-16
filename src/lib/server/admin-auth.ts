import 'server-only';
import type { NextRequest } from 'next/server';

/**
 * Shared gate for the internal/admin API routes the dashboard calls. The
 * dashboard's login screen collects this same secret from whoever's using it
 * and sends it back as a bearer token on every subsequent request — there's
 * no server session, so this check has to happen on every call.
 */
export function isAuthorizedAdmin(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_API_SECRET}`;
}
