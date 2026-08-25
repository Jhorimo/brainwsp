import type { Metadata } from 'next';
import { ConfirmProvider } from '@/components/confirm-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'BrainWSP | WhatsApp Business Hub',
  description: 'Gateway WhatsApp, bandeja de agentes e integraciones con tus sistemas',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body><ConfirmProvider>{children}</ConfirmProvider></body>
    </html>
  );
}
