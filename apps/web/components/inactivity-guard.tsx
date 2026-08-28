'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';
import { clearAuthSession } from '@/lib/api';

// Puramente por inactividad — no depende de cuándo vence el JWT real (12h, o 30 días con
// "Recuérdame"). Es una capa de seguridad aparte: si el usuario deja la sesión abierta sin
// tocar nada, se cierra sola aunque el token en sí siga siendo válido por horas.
const IDLE_TIMEOUT_MS = 20 * 60 * 1000; // inactividad antes de avisar
const WARNING_COUNTDOWN_MS = 2 * 60 * 1000; // tiempo que se muestra el aviso antes de cerrar sesión
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const;

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function InactivityGuard() {
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const [warningVisible, setWarningVisible] = useState(false);
  const [remainingMs, setRemainingMs] = useState(WARNING_COUNTDOWN_MS);

  const logout = useCallback(() => {
    clearAuthSession();
    router.replace('/login');
  }, [router]);

  const stayConnected = () => {
    lastActivityRef.current = Date.now();
    setWarningVisible(false);
    setRemainingMs(WARNING_COUNTDOWN_MS);
  };

  useEffect(() => {
    const markActive = () => {
      // Mientras el aviso está visible, el mouse/teclado se ignoran a propósito — que se
      // quede parado ahí es justamente la señal de que nadie está mirando; solo el botón
      // "Seguir conectado" debe poder cancelarlo.
      if (warningVisible) return;
      lastActivityRef.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, markActive, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActive));
  }, [warningVisible]);

  useEffect(() => {
    const interval = setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor >= IDLE_TIMEOUT_MS + WARNING_COUNTDOWN_MS) {
        logout();
        return;
      }
      if (idleFor >= IDLE_TIMEOUT_MS) {
        setWarningVisible(true);
        setRemainingMs(IDLE_TIMEOUT_MS + WARNING_COUNTDOWN_MS - idleFor);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [logout]);

  if (!warningVisible) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal idle-modal">
        <div className="idle-modal-icon"><Info size={26} /></div>
        <div className="modal-header" style={{ textAlign: 'center' }}>
          <h2>Tu sesión está por expirar</h2>
          <p>Llevas un rato sin actividad. Por seguridad, tu sesión se cerrará en <strong>{formatCountdown(remainingMs)}</strong> si no confirmas que sigues aquí.</p>
        </div>
        <div className="modal-actions" style={{ justifyContent: 'center' }}>
          <button className="button primary" type="button" onClick={stayConnected}>Seguir conectado</button>
          <button className="button" type="button" onClick={logout}>Cerrar sesión ahora</button>
        </div>
      </div>
    </div>
  );
}
