'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { useConfirm } from '@/components/confirm-provider';
import { apiFetch } from '@/lib/api';

type SystemSettings = {
  mediaRetentionDays: number;
  maxMediaSizeBytes: number;
  tempMaxMediaSizeBytes: number | null;
  tempMaxMediaSizeUntil: string | null;
  effectiveMaxMediaSizeBytes: number;
  // Techo del proxy (UPLOAD_PROXY_LIMIT_MB en el .env de la API); null si no se declaró.
  proxyLimitBytes: number | null;
};

const MB = 1024 * 1024;
const TEMP_HOURS = [1, 4, 24];

type HeavyFile = {
  id: string;
  fileName: string | null;
  fileSize: number | null;
  type: string;
  createdAt: string;
  company: { name: string } | null;
};

const typeLabels: Record<string, string> = { IMAGE: 'Imagen', VIDEO: 'Video', AUDIO: 'Audio', DOCUMENT: 'Documento', STICKER: 'Sticker' };

function formatMb(bytes: number | null) {
  if (!bytes) return '—';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminSettingsPage() {
  const confirm = useConfirm();
  const [retentionDays, setRetentionDays] = useState('7');
  const [maxSizeMb, setMaxSizeMb] = useState('64');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [heavyFiles, setHeavyFiles] = useState<HeavyFile[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [tempMb, setTempMb] = useState('200');
  const [tempHours, setTempHours] = useState(4);
  const [tempSaving, setTempSaving] = useState(false);
  const [error, setError] = useState('');

  const loadSettings = () => {
    apiFetch<SystemSettings>('/system-settings')
      .then((s) => {
        setSettings(s);
        setRetentionDays(String(s.mediaRetentionDays));
        setMaxSizeMb(String(Math.round(s.maxMediaSizeBytes / MB)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración'));
  };

  const loadHeavyFiles = () => {
    apiFetch<HeavyFile[]>('/system-settings/heaviest-files')
      .then(setHeavyFiles)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los archivos'));
  };

  useEffect(() => { loadSettings(); loadHeavyFiles(); }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const updated = await apiFetch<SystemSettings>('/system-settings', {
        method: 'PATCH',
        body: JSON.stringify({
          mediaRetentionDays: Number(retentionDays),
          maxMediaSizeBytes: Number(maxSizeMb) * 1024 * 1024,
        }),
      });
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const activateTemporary = async () => {
    setTempSaving(true);
    setError('');
    try {
      setSettings(await apiFetch<SystemSettings>('/system-settings/temporary-limit', {
        method: 'POST',
        body: JSON.stringify({ maxMediaSizeBytes: Number(tempMb) * MB, hours: tempHours }),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo activar la subida grande');
    } finally {
      setTempSaving(false);
    }
  };

  const clearTemporary = async () => {
    setTempSaving(true);
    setError('');
    try {
      setSettings(await apiFetch<SystemSettings>('/system-settings/temporary-limit', { method: 'DELETE' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desactivar la subida grande');
    } finally {
      setTempSaving(false);
    }
  };

  const proxyMb = settings?.proxyLimitBytes ? Math.round(settings.proxyLimitBytes / MB) : null;
  const tempUntil = settings?.tempMaxMediaSizeUntil ? new Date(settings.tempMaxMediaSizeUntil) : null;
  const tempActive = !!(settings?.tempMaxMediaSizeBytes && tempUntil && tempUntil.getTime() > Date.now());
  const overProxy = (mb: number) => proxyMb !== null && mb > proxyMb;

  const deleteFile = async (file: HeavyFile) => {
    const ok = await confirm(`¿Borrar "${file.fileName || 'este archivo'}" (${formatMb(file.fileSize)})? El mensaje se conserva, solo se elimina el archivo.`, { danger: true, confirmText: 'Borrar' });
    if (!ok) return;
    try {
      await apiFetch(`/system-settings/heaviest-files/${file.id}`, { method: 'DELETE' });
      loadHeavyFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar el archivo');
    }
  };

  return (
    <AdminShell title="Configuraciones" subtitle="Ajustes globales del sistema — almacenamiento de archivos en MinIO">
      {error && <div className="error-box">{error}</div>}

      <section className="table-card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 14px' }}>Almacenamiento de archivos</h3>
        <div className="plan-form-grid">
          <div className="field">
            <label>Eliminación automática (días de antigüedad)</label>
            <input type="number" min={1} max={365} value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} />
          </div>
          <div className="field">
            <label>Tamaño máximo por archivo (MB)</label>
            <input type="number" min={1} max={500} value={maxSizeMb} onChange={(e) => setMaxSizeMb(e.target.value)} />
            {overProxy(Number(maxSizeMb)) && <span className="settings-warning">Supera el techo del servidor ({proxyMb} MB): los archivos más grandes que eso fallarán con "Failed to fetch".</span>}
          </div>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 11, margin: '4px 0 14px' }}>
          Los archivos que no sean imagen ni PDF (video, audio, otros documentos) se borran de forma automática pasados los días
          configurados. Las imágenes y los PDF se conservan hasta que un superadmin los borre a mano. El tamaño máximo aplica tanto a lo que un agente envía desde el panel como a lo que se recibe por WhatsApp.
        </p>
        <div className="modal-actions" style={{ padding: 0, border: 0, justifyContent: 'flex-start' }}>
          <button type="button" className="button primary" disabled={saving} onClick={save}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {saved && <span style={{ color: 'var(--success-text)', fontSize: 11, alignSelf: 'center' }}>Guardado</span>}
        </div>
      </section>

      <section className="table-card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 6px' }}>Subida grande temporal</h3>
        <p style={{ color: 'var(--muted)', fontSize: 11, margin: '0 0 14px' }}>
          Sube el máximo solo por un tiempo para un envío puntual (un video para una automatización, por ejemplo). Al vencer vuelve
          solo al tamaño normal. Aplica a lo que se envía (chats, respuestas rápidas, automatizaciones); lo que llega por WhatsApp
          sigue con el máximo normal.
        </p>
        {tempActive ? (
          <div className="settings-temp-active">
            <span>
              Activa: hasta <strong>{Math.round((settings!.tempMaxMediaSizeBytes || 0) / MB)} MB</strong> por archivo, hasta las{' '}
              <strong>{tempUntil!.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}</strong>.
            </span>
            <button type="button" className="button small" disabled={tempSaving} onClick={() => void clearTemporary()}>
              {tempSaving ? 'Desactivando...' : 'Desactivar ahora'}
            </button>
          </div>
        ) : (
          <>
            <div className="plan-form-grid">
              <div className="field">
                <label>Tamaño máximo temporal (MB)</label>
                <input type="number" min={1} max={500} value={tempMb} onChange={(e) => setTempMb(e.target.value)} />
                {overProxy(Number(tempMb)) && <span className="settings-warning">Supera el techo del servidor ({proxyMb} MB).</span>}
              </div>
              <div className="field">
                <label>Duración</label>
                <select value={tempHours} onChange={(e) => setTempHours(Number(e.target.value))}>
                  {TEMP_HOURS.map((h) => <option key={h} value={h}>{h === 1 ? '1 hora' : `${h} horas`}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-actions" style={{ padding: 0, border: 0, justifyContent: 'flex-start' }}>
              <button type="button" className="button primary" disabled={tempSaving || !Number(tempMb)} onClick={() => void activateTemporary()}>
                {tempSaving ? 'Activando...' : 'Activar'}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="table-card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 10px' }}>Límites que no dependen de esta pantalla</h3>
        <ul className="settings-limits">
          <li>
            <strong>Techo del servidor (proxy):</strong>{' '}
            {proxyMb ? `${proxyMb} MB. Ningún archivo más grande puede subirse, aunque el máximo de arriba sea mayor.` : 'no declarado. Defínelo con UPLOAD_PROXY_LIMIT_MB en el .env de la API para que esta pantalla avise si lo superas.'}
          </li>
          <li><strong>Límite técnico de la API:</strong> 500 MB por archivo.</li>
          <li><strong>WhatsApp:</strong> un video se envía como video hasta unos 16 MB; más grande llega como documento (hasta 2 GB). Para automatizaciones conviene comprimirlo (720p suele quedar en 30–60 MB).</li>
          <li><strong>Memoria:</strong> la API carga el archivo completo en memoria al recibirlo; varios archivos de cientos de MB a la vez pueden saturar el servidor.</li>
        </ul>
      </section>

      <section className="table-card">
        <h3 style={{ margin: '14px 0 0 20px' }}>Los 10 archivos más pesados</h3>
        <table>
          <thead>
            <tr>
              <th>Archivo</th>
              <th>Tipo</th>
              <th>Peso</th>
              <th>Empresa</th>
              <th>Fecha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {heavyFiles.map((file) => (
              <tr key={file.id}>
                <td>{file.fileName || '—'}</td>
                <td>{typeLabels[file.type] || file.type}</td>
                <td>{formatMb(file.fileSize)}</td>
                <td>{file.company?.name || '—'}</td>
                <td>{new Date(file.createdAt).toLocaleDateString('es-PE')}</td>
                <td>
                  <button type="button" className="icon-button danger" onClick={() => deleteFile(file)} aria-label="Borrar archivo" title="Borrar archivo">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {heavyFiles.length === 0 && (
              <tr><td colSpan={6}>No hay archivos almacenados todavía.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
