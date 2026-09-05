import type { Metadata } from 'next';
import { ConfirmProvider } from '@/components/confirm-provider';
import './globals.css';

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
    <html lang="es">
      <body><ConfirmProvider>{children}</ConfirmProvider></body>
    </html>
  );
}
