import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://connext-platform.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/internal/', '/mentor/', '/mentee/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
