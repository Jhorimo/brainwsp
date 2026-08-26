// The BrainWSP mark: a chat bubble (the WhatsApp/messaging core of the product) with an
// accent "spark" dot standing in for the AI/automation layer on top of it. Sits inside the
// existing `.brand-mark` gradient badge — this only replaces what used to be a bare "B".
export function BrandIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4.5" width="18" height="12" rx="6" fill="white" />
      <path d="M7 16.5 L7 20.3c0 .46.53.71.88.42L12.4 16.5Z" fill="white" />
      <circle cx="19" cy="4.5" r="3.6" fill="var(--accent, #e4007c)" stroke="white" strokeWidth="1.4" />
    </svg>
  );
}
