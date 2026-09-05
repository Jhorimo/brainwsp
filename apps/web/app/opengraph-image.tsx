import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Mismo ícono que BrandIcon (components/brand-mark.tsx) pero como paths planos — next/og
// no soporta el <g transform="scale(...)"> que usa el componente real, así que las
// coordenadas ya vienen pre-escaladas a mano en vez de reutilizarlo directamente.
function Mark() {
  return (
    <svg width="132" height="132" viewBox="0 0 40 40" fill="none">
      <g>
        <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" fill="white" />
        <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" fill="white" />
      </g>
      <g transform="translate(24.5 4)">
        <rect x="2" y="2" width="26" height="16" rx="8" fill="white" />
        <path d="M9 18 v6.5c0 1 1.2 1.5 1.9 .75L17 18Z" fill="white" />
        <rect x="5" y="5" width="20" height="10" rx="5" fill="#25D366" />
      </g>
    </svg>
  );
}

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'flex-start', justifyContent: 'center', padding: '80px',
          background: 'linear-gradient(135deg, #213786 0%, #063f93 55%, #3c86ff 100%)',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 48 }}>
          <div style={{ width: 96, height: 96, borderRadius: 26, background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mark />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: 'white' }}>BrainWSP</span>
            <span style={{ fontSize: 20, fontWeight: 600, color: '#a9c0e3', letterSpacing: 2, textTransform: 'uppercase' }}>Business Hub</span>
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 56, fontWeight: 800, color: 'white', lineHeight: 1.15, maxWidth: 980 }}>
          Centraliza WhatsApp, atiende en equipo y vende más.
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: '#c7d6f0', marginTop: 28, maxWidth: 900 }}>
          Bandeja compartida en tiempo real, automatizaciones sin código, CRM y conexión con tu ERP.
        </div>
      </div>
    ),
    { ...size },
  );
}
