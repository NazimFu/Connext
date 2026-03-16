// src/app/api/admin/google-auth/callback/route.ts
//
// Google OAuth2 callback handler.
// After the admin clicks "Authorize" on the Google consent screen,
// Google redirects here with ?code=... — we exchange it for tokens
// and store them in Cosmos DB, then redirect back to the internal dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/google-token-manager';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/internal/dashboard?error=${encodeURIComponent(error)}`,
        request.url
      )
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/internal/dashboard?error=no_code', request.url)
    );
  }

  try {
    await exchangeCodeForTokens(code);
    return NextResponse.redirect(
      new URL('/internal/dashboard?success=true', request.url)
    );
  } catch (err: any) {
    console.error('[google-auth/callback] Token exchange failed:', err);
    return NextResponse.redirect(
      new URL(
        `/internal/dashboard?error=${encodeURIComponent(err.message || 'token_exchange_failed')}`,
        request.url
      )
    );
  }
}