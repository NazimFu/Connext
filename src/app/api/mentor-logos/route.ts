import { NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif']);
const LOGOS_DIR = path.join(process.cwd(), 'public', 'Mentor Logos');

/**
 * Lists whatever logo images are currently sitting in public/Mentor Logos —
 * purely local files, manually managed, unrelated to mentor profiles or any
 * external service. Display name is the filename with the extension stripped.
 */
export async function GET() {
  try {
    const entries = await readdir(LOGOS_DIR, { withFileTypes: true });

    const logos = entries
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => {
        const name = entry.name.slice(0, entry.name.length - path.extname(entry.name).length);
        return {
          url: `/Mentor Logos/${encodeURIComponent(entry.name)}`,
          name,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ logos });
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return NextResponse.json({ logos: [] });
    }
    console.error('[mentor-logos] Failed to list logos:', error);
    return NextResponse.json({ logos: [] });
  }
}
