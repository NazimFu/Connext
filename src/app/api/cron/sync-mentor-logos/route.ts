import { NextRequest, NextResponse } from 'next/server';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

// Polls the Drive folder and pushes any new/changed/removed logos into
// Firebase Storage, so a logo dropped into Drive shows up on the homepage
// on its own — no manual `npm run sync:logos`, no redeploy. Triggered daily
// by Vercel Cron (see the "sync-mentor-logos" entry in vercel.json).

export const maxDuration = 60;

const STORAGE_PREFIX = 'mentor-logos/';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif']);
const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/gif': '.gif',
};

type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string; size?: string };

function getExtname(name: string) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i).toLowerCase() : '';
}

function sanitizeFilename(name: string) {
  return name.replace(/[/\\?%*:|"<>]/g, '').trim();
}

function resolveFilename(file: DriveFile) {
  const sanitized = sanitizeFilename(file.name) || file.id;
  const existingExt = getExtname(sanitized);
  if (IMAGE_EXTENSIONS.has(existingExt)) return sanitized;
  return `${sanitized}${MIME_TO_EXT[file.mimeType] || '.png'}`;
}

function getBucket() {
  if (getApps().length === 0) {
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
        privateKey: privateKey!,
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    });
  }
  return getStorage().bucket();
}

async function listDriveImages(apiKey: string, folderId: string): Promise<DriveFile[]> {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,size)');
  url.searchParams.set('pageSize', '1000');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Drive files.list failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const files: DriveFile[] = Array.isArray(data.files) ? data.files : [];
  return files.filter((f) => typeof f.mimeType === 'string' && f.mimeType.startsWith('image/'));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One retry with a short backoff — Drive's download endpoint occasionally
// 403s script-like requests ("automated queries"). This runs on a recurring
// schedule anyway, so a persistent failure just gets picked up next cycle
// rather than being retried aggressively in-request.
async function downloadDriveFile(apiKey: string, fileId: string, attempt = 1): Promise<Buffer> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set('alt', 'media');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < 2) {
      await sleep(1500);
      return downloadDriveFile(apiKey, fileId, attempt + 1);
    }
    throw new Error(`Drive download failed for file ${fileId}: ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  const folderId = process.env.MENTOR_LOGOS_DRIVE_FOLDER_ID;
  if (!apiKey || !folderId) {
    return NextResponse.json(
      { error: 'Missing GOOGLE_DRIVE_API_KEY or MENTOR_LOGOS_DRIVE_FOLDER_ID' },
      { status: 500 }
    );
  }

  try {
    const bucket = getBucket();
    const driveFiles = await listDriveImages(apiKey, folderId);

    // One snapshot of what's already in Storage — used both to skip
    // re-downloading unchanged files below, and to clean up stale ones after.
    const [existingFiles] = await bucket.getFiles({ prefix: STORAGE_PREFIX });
    const existingByPath = new Map(existingFiles.map((f) => [f.name, f]));

    const keepObjectPaths = new Set<string>();
    const errors: { file: string; error: string }[] = [];
    let synced = 0;
    let skipped = 0;

    for (const file of driveFiles) {
      const filename = resolveFilename(file);
      const objectPath = `${STORAGE_PREFIX}${filename}`;
      if (keepObjectPaths.has(objectPath)) continue;
      keepObjectPaths.add(objectPath);

      // Skip the Drive download entirely if this exact file (by Drive's own
      // modifiedTime + size) is already what's sitting in Storage.
      const existingMeta = existingByPath.get(objectPath)?.metadata?.metadata as
        | Record<string, string>
        | undefined;
      const unchanged =
        existingMeta?.driveModifiedTime === file.modifiedTime &&
        existingMeta?.driveSize === (file.size ?? '');
      if (unchanged) {
        skipped++;
        continue;
      }

      try {
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
      } catch (error) {
        // Leave this filename out of keepObjectPaths removal-protection logic
        // below by NOT removing it from the set — a failed upload shouldn't
        // get the previous good copy (if any) deleted as "stale".
        errors.push({ file: file.name, error: (error as Error).message });
      }
    }

    let removed = 0;
    for (const existing of existingFiles) {
      if (keepObjectPaths.has(existing.name)) continue;
      await existing.delete();
      removed++;
    }

    return NextResponse.json({
      success: true,
      foundInDrive: driveFiles.length,
      synced,
      skipped,
      removed,
      errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cron/sync-mentor-logos] Failed:', error);
    return NextResponse.json(
      { error: 'Failed to sync mentor logos', message: (error as Error).message },
      { status: 500 }
    );
  }
}
