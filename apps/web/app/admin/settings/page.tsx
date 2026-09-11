'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { useConfirm } from '@/components/confirm-provider';
import { apiFetch } from '@/lib/api';

type SystemSettings = { mediaRetentionDays: number; maxMediaSizeBytes: number };

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
  const [error, setError] = useState('');

  const loadSettings = () => {
    apiFetch<SystemSettings>('/system-settings')
      .then((s) => {
        setRetentionDays(String(s.mediaRetentionDays));
        setMaxSizeMb(String(Math.round(s.maxMediaSizeBytes / (1024 * 1024))));
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
      await apiFetch('/system-settings', {
        method: 'PATCH',
        body: JSON.stringify({
          mediaRetentionDays: Number(retentionDays),
          maxMediaSizeBytes: Number(maxSizeMb) * 1024 * 1024,
        }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

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
          </div>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 11, margin: '4px 0 14px' }}>
          Los archivos que no sean imagen (video, documento, audio) se borran de forma automática pasados los días
          configurados. El tamaño máximo aplica tanto a lo que un agente envía desde el panel como a lo que se recibe por WhatsApp.
        </p>
        <div className="modal-actions" style={{ padding: 0, border: 0, justifyContent: 'flex-start' }}>
          <button type="button" className="button primary" disabled={saving} onClick={save}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {saved && <span style={{ color: 'var(--success)', fontSize: 11, alignSelf: 'center' }}>Guardado</span>}
        </div>
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
