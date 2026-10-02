'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { io } from 'socket.io-client';
import { apiFetch, getToken, SOCKET_URL } from '@/lib/api';

type InstanceLite = { id: string; name: string; status: string; lastConnectedAt?: string | null };

// Estados en los que una línea ya vinculada dejó de funcionar y alguien debe actuar.
// RECONNECTING queda fuera a propósito: se resuelve sola y avisarlo sería ruido.
const DOWN_STATUSES = ['LOGGED_OUT', 'QR_PENDING', 'ERROR'];

// Aviso fijo (sin botón de cerrar) mientras alguna línea de WhatsApp esté caída: desaparece
// solo cuando la instancia vuelve a CONNECTED. Exige lastConnectedAt para no avisar de una
// instancia recién creada que todavía no se vinculó nunca.
export function WhatsAppStatusToast() {
  const [down, setDown] = useState<InstanceLite[]>([]);

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<InstanceLite[]>('/instances');
      setDown(list.filter((i) => i.lastConnectedAt && DOWN_STATUSES.includes(i.status)));
    } catch {
      // Sin acceso al módulo (p. ej. un agente restringido) o sin red: simplemente no se avisa.
    }
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    void load();
    const socket = io(SOCKET_URL, { auth: { token: getToken() } });
    socket.on('connect', () => void load());
    socket.on('instance.updated', (updated: InstanceLite) => {
      setDown((current) => {
        const rest = current.filter((i) => i.id !== updated.id);
        return updated.lastConnectedAt && DOWN_STATUSES.includes(updated.status) ? [...rest, updated] : rest;
      });
    });
    return () => { socket.disconnect(); };
  }, [load]);

  if (!down.length) return null;
  const names = down.map((i) => i.name).join(', ');
  return (
    <div className="wa-down-toast" role="alert">
      <WifiOff size={18} />
      <div>
        <strong>{down.length === 1 ? 'WhatsApp desconectado' : `${down.length} WhatsApp desconectados`}</strong>
        <span>{names}. Escanea el QR para volver a conectar.</span>
      </div>
      <Link href="/instances">Reconectar</Link>
    </div>
  );
}
