import { useState } from 'react';
import { updateSettings } from '../store';
import { useSettings } from './hooks';
import { sha256 } from './util';

export function Check({ ok, label, warnOnly }: { ok: boolean; label: string; warnOnly?: boolean }) {
  return (
    <div className="row small" style={{ alignItems: 'flex-start' }}>
      <span aria-hidden style={{ fontWeight: 800, color: ok ? 'var(--ok)' : warnOnly ? 'var(--warn)' : 'var(--error)' }}>{ok ? '✓' : warnOnly ? '•' : '✕'}</span>
      <span>{label}</span>
    </div>
  );
}

export async function hashPin(pin: string, deviceId: string) {
  return sha256(`birdtally:${deviceId}:${pin}`);
}

export function PinSetting({ hasPin }: { hasPin: boolean }) {
  const settings = useSettings();
  const [pin, setPin] = useState('');
  if (!settings) return null;
  return (
    <div className="stack">
      <div style={{ fontWeight: 700 }}>App lock</div>
      <div className="muted small">
        Optional PIN asked when BirdTally opens. It hides your notebook from casual access; your phone’s own passcode remains the main protection.
      </div>
      {hasPin ? (
        <button className="btn small" onClick={() => updateSettings({ pinHash: undefined })}>Turn off PIN</button>
      ) : (
        <div className="row">
          <input className="text" inputMode="numeric" type="password" placeholder="4–8 digits" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
          <button className="btn small" disabled={pin.length < 4} onClick={async () => (await updateSettings({ pinHash: await hashPin(pin, settings.deviceId) }), setPin(''))}>
            Set PIN
          </button>
        </div>
      )}
    </div>
  );
}
