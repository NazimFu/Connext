// src/app/api/admin/google-auth/route.ts
//
// Admin API for managing Google Calendar OAuth tokens.
// GET  — returns current token status + authorization URL
// DELETE — revokes and clears stored tokens (forces re-auth)

import { NextRequest, NextResponse } from 'next/server';
import {
  readTokens,
  deleteTokens,
  buildAuthorizationUrl,
} from '@/lib/google-token-manager';

export async function GET(request: NextRequest) {
  try {
    const tokens = await readTokens();
    const authUrl = buildAuthorizationUrl();

    if (!tokens) {
      return NextResponse.json({
        status: 'not_authorized',
        message: 'No Google tokens stored. Click the authorization URL to set up.',
        auth_url: authUrl,
      });
    }

    const isExpired =
      tokens.expiry_date && tokens.expiry_date < Date.now() + 60_000;
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : 'unknown';

    return NextResponse.json({
      status: 'authorized',
      has_refresh_token: !!tokens.refresh_token,
      access_token_expires_at: expiresAt,
      access_token_expired: !!isExpired,
      scope: tokens.scope,
      // Include auth_url so admin can easily re-authorize if needed
      auth_url: authUrl,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to read token status', details: err.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await deleteTokens();
    return NextResponse.json({
      success: true,
      message: 'Tokens cleared. Use the authorization URL to re-authorize.',
      auth_url: buildAuthorizationUrl(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to delete tokens', details: err.message },
      { status: 500 }
    );
  }
}