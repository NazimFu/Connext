/**
 * Google Token Manager
 *
 * Stores OAuth2 tokens in Cosmos DB so they persist across server restarts.
 * Auto-refreshes the access token on every use and saves the result back,
 * keeping the token chain alive indefinitely (as long as the app is used at
 * least once every 6 months — Google's inactivity limit for refresh tokens).
 */

import { google } from 'googleapis';
import { CosmosClient } from '@azure/cosmos';

const TOKEN_DOC_ID = 'google_calendar_token';
const TOKEN_PARTITION_KEY = 'google_calendar_token'; // partition key = id value
const MENTOR_CONTAINER_NAME = 'mentor';

function getContainer() {
  const client = new CosmosClient({
    endpoint: process.env.COSMOS_DB_ENDPOINT!,
    key: process.env.COSMOS_DB_KEY!,
  });
  // Fall back between the two env var names used across this codebase
  const dbId = process.env.COSMOS_DB_DATABASE || process.env.COSMOS_DB_DATABASE_ID!;
  const database = client.database(dbId);
  return database.container(MENTOR_CONTAINER_NAME);
}

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope?: string;
}

/** Read tokens from Cosmos DB */
export async function readTokens(): Promise<StoredTokens | null> {
  try {
    const container = getContainer();
    const { resources } = await container.items
      .query({
        query: 'SELECT * FROM c WHERE c.id = @id',
        parameters: [{ name: '@id', value: TOKEN_DOC_ID }],
      })
      .fetchAll();

    if (resources.length === 0) return null;
    const doc = resources[0];
    return {
      access_token: doc.access_token,
      refresh_token: doc.refresh_token,
      expiry_date: doc.expiry_date,
      token_type: doc.token_type || 'Bearer',
      scope: doc.scope,
    };
  } catch (err) {
    console.error('[TokenManager] Failed to read tokens:', err);
    return null;
  }
}

/** Write tokens to Cosmos DB (upsert) */
export async function writeTokens(tokens: StoredTokens): Promise<void> {
  try {
    const container = getContainer();
    // Use TOKEN_DOC_ID as both id AND partition key so delete works reliably
    await container.items.upsert({
      id: TOKEN_DOC_ID,
      type: TOKEN_PARTITION_KEY,
      ...tokens,
      updated_at: new Date().toISOString(),
    });
    console.log('[TokenManager] Tokens saved to DB');
  } catch (err) {
    console.error('[TokenManager] Failed to write tokens:', err);
    throw err;
  }
}

/** Delete stored tokens (used when re-authorizing or clearing) */
export async function deleteTokens(): Promise<void> {
  try {
    const container = getContainer();

    // Container partition key path is /id, so the partition key value
    // is always the document's id — which is TOKEN_DOC_ID.
    await container.item(TOKEN_DOC_ID, TOKEN_DOC_ID).delete();
    console.log('[TokenManager] Token document deleted');
  } catch (err: any) {
    if (err.code === 404) {
      // Document doesn't exist — nothing to delete, that's fine
      console.log('[TokenManager] No token document found to delete (already gone)');
      return;
    }
    console.error('[TokenManager] Failed to delete tokens:', err);
    // Don't throw — a failed delete should not block re-authorization
  }
}

/**
 * Get a ready-to-use OAuth2 client with a valid (auto-refreshed) access token.
 * Throws if no tokens are stored — the admin needs to authorize first.
 */
export async function getAuthenticatedClient(): Promise<google.auth.OAuth2> {
  const storedTokens = await readTokens();

  if (!storedTokens?.refresh_token) {
    throw new Error(
      'NO_TOKENS_STORED: Google Calendar is not authorized yet. ' +
        'Visit /internal/dashboard to complete the one-time setup.'
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      `${process.env.NEXTAUTH_URL || 'https://connext-platform.vercel.app'}/api/admin/google-auth/callback`
  );

  oauth2Client.setCredentials({
    refresh_token: storedTokens.refresh_token,
    access_token: storedTokens.access_token,
    expiry_date: storedTokens.expiry_date,
    token_type: storedTokens.token_type,
  });

  // Listen for token refreshes and persist the new tokens immediately
  oauth2Client.on('tokens', async (newTokens) => {
    console.log('[TokenManager] Access token refreshed — saving to DB');
    const updatedTokens: StoredTokens = {
      refresh_token: newTokens.refresh_token || storedTokens.refresh_token,
      access_token: newTokens.access_token!,
      expiry_date: newTokens.expiry_date!,
      token_type: newTokens.token_type || 'Bearer',
      scope: newTokens.scope,
    };
    await writeTokens(updatedTokens);
  });

  // Force a refresh now if the access token is expired or missing
  const isExpired =
    !storedTokens.access_token ||
    (storedTokens.expiry_date && storedTokens.expiry_date < Date.now() + 60_000);

  if (isExpired) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
    } catch (err: any) {
      if (
        err.message?.includes('invalid_grant') ||
        err.message?.includes('Token has been expired')
      ) {
        await deleteTokens();
        throw new Error(
          'REFRESH_TOKEN_EXPIRED: The Google authorization has expired or been revoked. ' +
            'Visit /internal/dashboard to re-authorize.'
        );
      }
      throw err;
    }
  }

  return oauth2Client;
}

/** Build the OAuth2 authorization URL for the admin setup flow */
export function buildAuthorizationUrl(): string {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      `${process.env.NEXTAUTH_URL || 'https://connext-platform.vercel.app'}/api/admin/google-auth/callback`
  );

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent',
  });
}

/** Exchange an authorization code for tokens and persist them */
export async function exchangeCodeForTokens(code: string): Promise<StoredTokens> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      `${process.env.NEXTAUTH_URL || 'https://connext-platform.vercel.app'}/api/admin/google-auth/callback`
  );

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh_token returned. Make sure the OAuth app is configured with access_type=offline ' +
        'and that you are authorizing for the first time (or revoked previous access).'
    );
  }

  const stored: StoredTokens = {
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date!,
    token_type: tokens.token_type || 'Bearer',
    scope: tokens.scope,
  };

  await writeTokens(stored);
  return stored;
}