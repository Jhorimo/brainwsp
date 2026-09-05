import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Todo lo que cuelga del panel autenticado no le sirve a nadie en un buscador — solo es
// indexable la landing y las páginas de acceso/legales. Si agregas una ruta pública nueva,
// también hay que sumarla a sitemap.ts.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/login', '/register', '/privacidad', '/terminos'],
      disallow: [
        '/dashboard', '/conversations', '/instances', '/automations', '/team', '/incidents',
        '/api-settings', '/feedback', '/crm', '/calendar', '/my-plan', '/admin',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
