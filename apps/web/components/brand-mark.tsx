// The BrainWSP mark: a bold "B" with a WhatsApp-style chat bubble badge tucked into its
// top-right corner — the badge is what actually says "this is a WhatsApp platform", kept
// small and separated by a white ring so it reads as one clean composition even at
// favicon size, instead of colliding with the letterform.
// No background here — this renders inside the existing `.brand-mark` gradient badge.
export function BrandIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden>
      <text x="20" y="76" fontFamily="Arial, Helvetica, sans-serif" fontWeight={900} fontSize={66} fill="white">B</text>
      <rect x="54" y="10" width="32" height="23" rx="9.5" fill="white" />
      <path d="M61 33 v9 c0 1.5 1.8 2.3 2.9 1.15 L70.5 33 Z" fill="white" />
      <rect x="57" y="13" width="26" height="17" rx="6.5" fill="#25D366" />
      <circle cx="65.5" cy="21.5" r="1.7" fill="white" />
      <circle cx="70" cy="21.5" r="1.7" fill="white" />
      <circle cx="74.5" cy="21.5" r="1.7" fill="white" />
    </svg>
  );
}
