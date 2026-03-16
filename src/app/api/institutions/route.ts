import { NextResponse } from 'next/server';
import { database } from '@/lib/cosmos';

// Convert Google Drive share/open/thumbnail links into direct, embeddable URLs
function normalizeDriveUrl(url: string): string {
  try {
    const u = new URL(url);

    // If it's already a direct googleusercontent link, leave it
    if (u.hostname.includes('googleusercontent.com')) return url;

    if (u.hostname === 'drive.google.com') {
      // Patterns we handle:
      // - https://drive.google.com/file/d/FILE_ID/view
      // - https://drive.google.com/open?id=FILE_ID
      // - https://drive.google.com/uc?id=FILE_ID&export=download
      // - https://drive.google.com/thumbnail?id=FILE_ID&sz=w1000
      let id = '';

      const fileMatch = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileMatch) {
        id = fileMatch[1];
      } else if (u.searchParams.get('id')) {
        id = u.searchParams.get('id') as string;
      }

      if (id) {
        // Use the standard embeddable endpoint
        return `https://drive.google.com/uc?export=view&id=${id}`;
      }
    }
  } catch {
    // fall through and return original url
  }
  return url;
}

export async function GET() {
  try {
    console.log('[institutions] Fetching institution photos from Cosmos DB');
    const container = database.container('mentor');

    const querySpec = {
      query: 'SELECT c.institution_photo FROM c WHERE IS_DEFINED(c.institution_photo)',
      parameters: []
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    // Flatten possible arrays, filter falsy, ensure strings, de-duplicate
    const photosRaw = (resources || [])
      .flatMap((item: any) => {
        const val = item?.institution_photo;
        if (!val) return [] as string[];
        if (Array.isArray(val)) return val.filter(Boolean);
        if (typeof val === 'string') return [val];
        return [] as string[];
      })
      .filter((url: any) => typeof url === 'string' && url.trim().length > 0) as string[];

    // Normalize Google Drive links so they can render in <img>
    const normalized = photosRaw.map(normalizeDriveUrl);

    // De-duplicate after normalization
    const photos = Array.from(new Set(normalized));

    console.log(`[institutions] Found ${photos.length} unique institution photos`);

    return NextResponse.json({ success: true, photos });
  } catch (error) {
    console.error('[institutions] Error fetching institution photos:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch institution photos',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
