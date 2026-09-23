// The BrainWSP mark: the actual brain silhouette (both hemispheres, same construction as
// Brain Tech's own logo) with a WhatsApp-style chat bubble badge tucked into its top-right
// corner — "Brain" is the whole icon, "WSP" is the badge on top of it, mirroring how the
// product name itself is built. A lone half-brain doesn't read as a brain at all once
// tested at small sizes, so the badge approach (not a literal split) is what makes both
// halves of the concept legible down to favicon size.
// No background here — this renders inside the existing `.brand-mark` gradient badge.
export function BrandIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <g transform="translate(6 8) scale(1.0417)">
        <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" fill="white" />
        <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" fill="white" />
      </g>
      <g transform="translate(24.5 4) scale(0.45 0.4545)">
        <rect x="2" y="2" width="26" height="16" rx="8" fill="white" />
        <path d="M9 18 v6.5c0 1 1.2 1.5 1.9 .75L17 18Z" fill="white" />
        <rect x="5" y="5" width="20" height="10" rx="5" fill="#25D366" />
      </g>
    </svg>
  );
}

export function ClieneraMark({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path d="M35.8 13.1a16.5 16.5 0 1 0-.2 21.9l-5.5-4.7a9.2 9.2 0 1 1 .1-12.2l5.6-5Z" fill="currentColor" />
      <path d="m12.3 30.1-2.8 9.6 9.2-4.7-1.8-4.2-4.6-.7Z" fill="currentColor" />
      <path d="m24 15.2 2.5 6.1 6.1 2.5-6.1 2.5-2.5 6.1-2.5-6.1-6.1-2.5 6.1-2.5 2.5-6.1Z" fill="white" />
    </svg>
  );
}
