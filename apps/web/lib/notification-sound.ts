// Sonido de notificación de mensaje nuevo (dos tonos cortos tipo "pop"), sintetizado con Web
// Audio API — mismo motivo que el timbre de llamadas en incoming-call-provider.tsx: evita
// depender de un archivo de audio con licencia solo para esto.
export function playNotificationSound() {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const tone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain).connect(ctx.destination);
      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    };
    tone(880, 0, 0.12);
    tone(1175, 0.1, 0.16);
    setTimeout(() => void ctx.close().catch(() => {}), 500);
  } catch {
    // Audio bloqueado (sin gesto del usuario todavía, políticas del navegador, etc.) — no es
    // crítico, simplemente no sonará esta vez.
  }
}

// Preferencia de sonido por navegador. `key` la elige cada página (por canal en el widget,
// global en el panel) para que no se mezclen aunque compartan origen.
export function readSoundPref(key: string, defaultValue: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? defaultValue : raw === '1';
  } catch {
    return defaultValue;
  }
}

export function writeSoundPref(key: string, enabled: boolean) {
  try {
    localStorage.setItem(key, enabled ? '1' : '0');
  } catch {
    // localStorage bloqueado (modo privado, etc.) — la preferencia simplemente no persiste.
  }
}
