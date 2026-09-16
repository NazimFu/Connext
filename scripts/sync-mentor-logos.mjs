#!/usr/bin/env node
// Pulls institution/company logo images from a public Google Drive folder
// and uploads them to Firebase Storage (under mentor-logos/), which the
// homepage reads live via /api/mentor-logos. No redeploy needed — as soon
// as this script finishes, the new/changed logos show up on the site.
//
// Run whenever logos change in the Drive folder:
//
//   npm run sync:logos
//
// Requires the Drive folder to be shared as "Anyone with the link — Viewer",
// and these env vars (see .env):
//   GOOGLE_DRIVE_API_KEY          a Google Cloud API key with the Drive API enabled
//   MENTOR_LOGOS_DRIVE_FOLDER_ID  the folder's ID (the .../folders/<ID> part of its URL)
// Plus the existing Firebase Admin vars this app already uses:
//   NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL,
//   FIREBASE_ADMIN_PRIVATE_KEY, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET

import 'dotenv/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const STORAGE_PREFIX = 'mentor-logos/';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif']);
const MIME_TO_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/gif': '.gif',
};

const log = (message) => console.log(`[sync-mentor-logos] ${message}`);

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

function getExtname(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i).toLowerCase() : '';
}

function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '').trim();
}

function resolveFilename(file) {
  const sanitized = sanitizeFilename(file.name) || file.id;
  const existingExt = getExtname(sanitized);
  if (IMAGE_EXTENSIONS.has(existingExt)) return sanitized;
  const mappedExt = MIME_TO_EXT[file.mimeType] || '.png';
  return `${sanitized}${mappedExt}`;
}

function getBucket() {
  if (getApps().length === 0) {
    const privateKey = requireEnv('FIREBASE_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n');
    initializeApp({
      credential: cert({
        projectId: requireEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
        clientEmail: requireEnv('FIREBASE_ADMIN_CLIENT_EMAIL'),
        privateKey,
      }),
      storageBucket: requireEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    });
  }
  return getStorage().bucket();
}

async function listDriveImages(apiKey, folderId) {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,size)');
  url.searchParams.set('pageSize', '1000');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Drive files.list failed: ${res.status} ${res.statusText} ${body}`);
  }
  const data = await res.json();
  const files = Array.isArray(data.files) ? data.files : [];
  return files.filter((f) => typeof f.mimeType === 'string' && f.mimeType.startsWith('image/'));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Google's anti-abuse heuristics can flag rapid-fire, no-UA script requests
// to the download endpoint as "automated queries" (403) even with a valid
// key. A normal User-Agent plus a short retry/backoff clears this up.
async function downloadDriveFile(apiKey, fileId, attempt = 1) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set('alt', 'media');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const isRetryable = res.status === 403 || res.status === 429 || res.status >= 500;
    if (isRetryable && attempt < 4) {
      const delayMs = attempt * 1500;
      log(`Download got ${res.status} for file ${fileId}, retrying in ${delayMs}ms (attempt ${attempt + 1}/4)...`);
      await sleep(delayMs);
      return downloadDriveFile(apiKey, fileId, attempt + 1);
    }
    throw new Error(`Drive download failed for file ${fileId}: ${res.status} ${res.statusText} ${body}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const apiKey = requireEnv('GOOGLE_DRIVE_API_KEY');
  const folderId = requireEnv('MENTOR_LOGOS_DRIVE_FOLDER_ID');
  const bucket = getBucket();

  log(`Listing images in Drive folder ${folderId}...`);
  const driveFiles = await listDriveImages(apiKey, folderId);
  log(`Found ${driveFiles.length} image(s) in Drive.`);

  // One snapshot of what's already in Storage — used both to skip
  // re-downloading unchanged files below, and to clean up stale ones after.
  const [existingFiles] = await bucket.getFiles({ prefix: STORAGE_PREFIX });
  const existingByPath = new Map(existingFiles.map((f) => [f.name, f]));

  const keepObjectPaths = new Set();
  let isFirstDownload = true;
  let synced = 0;
  let skipped = 0;

  for (const file of driveFiles) {
    const filename = resolveFilename(file);
    const objectPath = `${STORAGE_PREFIX}${filename}`;
    if (keepObjectPaths.has(objectPath)) {
      log(`Skipping "${file.name}" — filename "${filename}" collides with another file already synced this run.`);
      continue;
    }
    keepObjectPaths.add(objectPath);

    // Skip the Drive download entirely if this exact file (by Drive's own
    // modifiedTime + size) is already what's sitting in Storage.
    const existingMeta = existingByPath.get(objectPath)?.metadata?.metadata;
    const unchanged =
      existingMeta?.driveModifiedTime === file.modifiedTime &&
      existingMeta?.driveSize === (file.size ?? '');
    if (unchanged) {
      log(`Unchanged, skipping: ${file.name}`);
      skipped++;
      continue;
    }

    // Small gap between requests so Drive doesn't see them as a burst.
    if (!isFirstDownload) await sleep(400);
    isFirstDownload = false;

    log(`Uploading "${file.name}" -> ${objectPath}`);
    const buffer = await downloadDriveFile(apiKey, file.id);
    const fileRef = bucket.file(objectPath);
    await fileRef.save(buffer, {
      metadata: {
        contentType: file.mimeType,
        cacheControl: 'public, max-age=86400',
        metadata: { driveModifiedTime: file.modifiedTime, driveSize: file.size ?? '' },
      },
    });
    await fileRef.makePublic();
    synced++;
  }

  // Remove Storage objects that are no longer in the Drive folder.
  let removed = 0;
  for (const existing of existingFiles) {
    if (keepObjectPaths.has(existing.name)) continue;
    await existing.delete();
    removed++;
    log(`Removed stale logo: ${existing.name}`);
  }

  log(`Done. ${synced} synced, ${skipped} unchanged, ${removed} removed. Live immediately — no redeploy needed.`);
}

main().catch((error) => {
  console.error('[sync-mentor-logos] Failed:', error.message);
  process.exitCode = 1;
});
