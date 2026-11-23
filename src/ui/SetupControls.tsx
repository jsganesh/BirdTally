export function Check({ ok, label, warnOnly }: { ok: boolean; label: string; warnOnly?: boolean }) {
  return (
    <div className="row small" style={{ alignItems: 'flex-start' }}>
      <span aria-hidden style={{ fontWeight: 800, color: ok ? 'var(--ok)' : warnOnly ? 'var(--warn)' : 'var(--error)' }}>{ok ? '✓' : warnOnly ? '•' : '✕'}</span>
      <span>{label}</span>
    </div>
  );
}
