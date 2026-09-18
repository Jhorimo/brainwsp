import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AnnouncementsProvider } from '@/components/announcements-provider';
import { ConfirmProvider } from '@/components/confirm-provider';
import './globals.css';

// Self-hosted at build time (no runtime request to Google) — globals.css was already
// declaring `font-family: Inter, ...` everywhere, but nothing ever actually loaded Inter,
// so every browser silently fell back to its OS default (Segoe UI / San Francisco /
// Roboto) instead. `variable` exposes it as --font-sans so globals.css picks it up without
// needing a class on every element.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

// Sin NEXT_PUBLIC_SITE_URL configurado (ver .env.example), todo — canonical, Open Graph,
// sitemap, robots — cae a localhost en vez de romperse silenciosamente en producción.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const TITLE = 'BrainWSP | WhatsApp Business Hub';
const DESCRIPTION = 'Centraliza WhatsApp, atiende en equipo y vende más desde un solo panel: bandeja compartida en tiempo real, automatizaciones sin código, CRM y conexión directa con tu ERP.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s | BrainWSP` },
  description: DESCRIPTION,
  keywords: ['WhatsApp Business', 'WhatsApp API', 'chatbot WhatsApp', 'CRM WhatsApp', 'automatización de conversaciones', 'bandeja compartida WhatsApp', 'BrainWSP'],
  authors: [{ name: 'Brain Tech' }],
  alternates: { canonical: '/' },
  // El resto del panel (dashboard, conversaciones, admin, etc.) queda detrás de login — no
  // tiene nada que ganar en buscadores y `robots.ts` ya lo bloquea aparte; esto es lo que
  // aplica a la landing y a login/register, que sí son públicas.
  robots: { index: true, follow: true },
  icons: { icon: '/icon.svg' },
  openGraph: {
    type: 'website',
    locale: 'es_PE',
    url: SITE_URL,
    siteName: 'BrainWSP',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={inter.variable}>
      <body><ConfirmProvider><AnnouncementsProvider>{children}</AnnouncementsProvider></ConfirmProvider></body>
    </html>
  );
}
