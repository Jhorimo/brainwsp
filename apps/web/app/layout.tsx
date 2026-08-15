import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BrainWSP | WhatsApp Business Hub',
  description: 'Gateway WhatsApp, bandeja de agentes e integraciones BrainPOS / ERP',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
