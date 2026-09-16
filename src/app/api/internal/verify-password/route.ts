import { NextRequest, NextResponse } from 'next/server';

// Lets the internal dashboard's login screen check a typed password against
// ADMIN_API_SECRET without the real secret ever being present in the client
// bundle — the comparison happens here, server-side. On success, the client
// keeps using whatever the user typed as the Bearer token for every other
// /api/internal/* and admin call (same secret, no separate session).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!password || password !== process.env.ADMIN_API_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
