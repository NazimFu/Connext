import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import path from 'path';
import { getAdminStorageBucket } from '@/lib/server/firebase-admin';

export const dynamic = 'force-dynamic';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif']);
const LOGOS_DIR = path.join(process.cwd(), 'public', 'Mentor Logos');
const STORAGE_PREFIX = 'mentor-logos/';

type Logo = { url: string; name: string };

const toDisplayName = (filename: string) => filename.slice(0, filename.length - path.extname(filename).length);

/**
 * Live source: logos uploaded directly to Firebase Storage (under
 * mentor-logos/), e.g. via the Firebase Console's Storage browser — no
 * redeploy needed to pick up a new/changed logo, since this reads Storage
 * at request time.
 */
async function listStorageLogos(): Promise<Logo[]> {
  const bucket = getAdminStorageBucket();
  const [files] = await bucket.getFiles({ prefix: STORAGE_PREFIX });

  return files
    .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
    .map((file) => {
      const filename = file.name.slice(STORAGE_PREFIX.length);
      return {
        url: `https://storage.googleapis.com/${bucket.name}/${STORAGE_PREFIX}${encodeURIComponent(filename)}`,
        name: toDisplayName(filename),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Fallback: whatever image files are sitting in public/Mentor Logos — for
 * manual one-off drops, or before Storage has been synced for the first time.
 */
async function listLocalLogos(): Promise<Logo[]> {
  try {
    const entries = await readdir(LOGOS_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => ({
        url: `/Mentor Logos/${encodeURIComponent(entry.name)}`,
        name: toDisplayName(entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.error('[mentor-logos] Failed to list local logos:', error);
    }
    return [];
  }
}

export async function GET() {
  try {
    const storageLogos = await listStorageLogos();
    if (storageLogos.length > 0) {
      return NextResponse.json({ logos: storageLogos });
    }
  } catch (error) {
    console.error('[mentor-logos] Firebase Storage lookup failed, falling back to local folder:', error);
  }

  return NextResponse.json({ logos: await listLocalLogos() });
}
