export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = normalized === 'connected' || normalized === 'sent' || normalized === 'read'
    ? 'success'
    : normalized.includes('connect') || normalized === 'qr_pending' || normalized === 'queued' || normalized === 'processing'
      ? 'warning'
      : normalized === 'error' || normalized === 'logged_out' || normalized === 'failed' || normalized === 'revoked'
        ? 'danger'
        : 'neutral';
  return <span className={`status-pill ${tone}`}><span className="status-dot" />{status.replaceAll('_', ' ')}</span>;
}
