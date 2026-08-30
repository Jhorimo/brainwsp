'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Plus, QrCode, Upload } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { useConfirm } from '@/components/confirm-provider';
import { adminPaymentMethodQrUrl, apiFetch } from '@/lib/api';

type PaymentMethod = {
  id: string;
  label: string;
  accountNumber: string;
  accountHolder: string;
  instructions?: string | null;
  qrImageUrl?: string | null;
  active: boolean;
  sortOrder: number;
};

const emptyForm = { label: '', accountNumber: '', accountHolder: '', instructions: '' };

export default function AdminPaymentMethodsPage() {
  const confirm = useConfirm();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editMethod, setEditMethod] = useState<PaymentMethod | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  // `pendingQrUrl` es la URL interna de MinIO que se manda al crear/guardar. `qrPreview` es lo
  // que se muestra en el modal: la vista previa local del archivo recién elegido (todavía no
  // existe un id de método para pedirle la imagen al proxy), o la imagen ya guardada al editar.
  const [pendingQrUrl, setPendingQrUrl] = useState<string | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setMethods(await apiFetch<PaymentMethod[]>('/admin/payment-methods')); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron cargar los métodos de pago'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const uploadQr = async (file: File) => {
    setQrPreview(URL.createObjectURL(file));
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { url } = await apiFetch<{ url: string }>('/admin/payment-methods/media', { method: 'POST', body: formData });
      setPendingQrUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el QR');
    } finally {
      setUploading(false);
    }
  };

  const openCreate = () => {
    setForm(emptyForm);
    setPendingQrUrl(null);
    setQrPreview(null);
    setModal(true);
  };

  const createMethod = async () => {
    if (!form.label.trim() || !form.accountNumber.trim() || !form.accountHolder.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/admin/payment-methods', {
        method: 'POST',
        body: JSON.stringify({ ...form, qrImageUrl: pendingQrUrl || undefined }),
      });
      setModal(false);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear el método de pago'); }
    finally { setSaving(false); }
  };

  const openEdit = (method: PaymentMethod) => {
    setEditForm({ label: method.label, accountNumber: method.accountNumber, accountHolder: method.accountHolder, instructions: method.instructions || '' });
    setPendingQrUrl(method.qrImageUrl || null);
    setQrPreview(method.qrImageUrl ? adminPaymentMethodQrUrl(method.id) : null);
    setEditMethod(method);
  };

  const saveEdit = async () => {
    if (!editMethod || !editForm.label.trim() || !editForm.accountNumber.trim() || !editForm.accountHolder.trim()) return;
    setSaving(true);
    try {
      const updated = await apiFetch<PaymentMethod>(`/admin/payment-methods/${editMethod.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...editForm, qrImageUrl: pendingQrUrl }),
      });
      setMethods((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditMethod(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar el método de pago'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (method: PaymentMethod) => {
    setMethods((current) => current.map((item) => (item.id === method.id ? { ...item, active: !method.active } : item)));
    try { await apiFetch(`/admin/payment-methods/${method.id}`, { method: 'PATCH', body: JSON.stringify({ active: !method.active }) }); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar'); await load(); }
  };

  const removeMethod = async (method: PaymentMethod) => {
    if (!(await confirm(`¿Eliminar "${method.label}"? Las solicitudes de pago ya hechas con este método conservan su historial.`, { confirmText: 'Eliminar' }))) return;
    setMethods((current) => current.filter((item) => item.id !== method.id));
    try { await apiFetch(`/admin/payment-methods/${method.id}`, { method: 'DELETE' }); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo eliminar'); await load(); }
  };

  return (
    <AdminShell title="Métodos de pago" subtitle="Cuentas donde tus clientes pagan manualmente su plan (Yape, Plin, Binance, transferencia...)" actions={<button className="button primary" onClick={openCreate}><Plus size={16} />Nuevo método</button>}>
      {error && <div className="error-box">{error}</div>}

      <div className="grid-stats team-stats">
        {methods.map((method) => (
          <div className="stat-card" key={method.id}>
            <div className="stat-icon">{method.qrImageUrl ? <img src={adminPaymentMethodQrUrl(method.id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 11 }} /> : <QrCode size={19} />}</div>
            <div className="stat-label">{method.label}{!method.active && <span className="row-sub" style={{ marginLeft: 8 }}>(inactivo)</span>}</div>
            <div className="stat-value" style={{ fontSize: 16 }}>{method.accountNumber}</div>
            <div className="stat-meta">{method.accountHolder}{method.instructions ? ` · ${method.instructions}` : ''}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button className="button small" onClick={() => openEdit(method)}><Pencil size={13} />Editar</button>
              <button className={`button small ${method.active ? '' : 'primary'}`} onClick={() => void toggleActive(method)}>{method.active ? 'Desactivar' : 'Activar'}</button>
              <button className="button small danger" onClick={() => void removeMethod(method)}>Eliminar</button>
            </div>
          </div>
        ))}
        {!methods.length && <div className="empty-state"><div><strong>Aún no hay métodos de pago</strong>Sin ninguno configurado, "Mi Plan" les dirá a tus clientes que te contacten directamente.</div></div>}
      </div>

      {(modal || editMethod) && (
        <div className="modal-backdrop" onClick={() => { setModal(false); setEditMethod(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>{editMethod ? 'Editar método de pago' : 'Nuevo método de pago'}</h2><p>Esta cuenta se le muestra a cualquier cliente que elija pagar manualmente.</p></div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field"><label>Nombre (ej: Yape, Binance)</label><input value={editMethod ? editForm.label : form.label} onChange={(e) => editMethod ? setEditForm({ ...editForm, label: e.target.value }) : setForm({ ...form, label: e.target.value })} placeholder="Yape" /></div>
                <div className="field"><label>Cuenta / número</label><input value={editMethod ? editForm.accountNumber : form.accountNumber} onChange={(e) => editMethod ? setEditForm({ ...editForm, accountNumber: e.target.value }) : setForm({ ...form, accountNumber: e.target.value })} placeholder="999 888 777" /></div>
                <div className="field"><label>Titular</label><input value={editMethod ? editForm.accountHolder : form.accountHolder} onChange={(e) => editMethod ? setEditForm({ ...editForm, accountHolder: e.target.value }) : setForm({ ...form, accountHolder: e.target.value })} placeholder="Irvin Castro" /></div>
                <div className="field"><label>Instrucciones (opcional)</label><input value={editMethod ? editForm.instructions : form.instructions} onChange={(e) => editMethod ? setEditForm({ ...editForm, instructions: e.target.value }) : setForm({ ...form, instructions: e.target.value })} placeholder="Escanea el QR y sube tu comprobante" /></div>
                <div className="field">
                  <label>Imagen QR (opcional)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {qrPreview && <img src={qrPreview} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />}
                    <button type="button" className="button small" disabled={uploading} onClick={() => fileInputRef.current?.click()}><Upload size={13} />{uploading ? 'Subiendo...' : qrPreview ? 'Cambiar QR' : 'Subir QR'}</button>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void uploadQr(file); }} />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => { setModal(false); setEditMethod(null); }}>Cancelar</button>
              {editMethod ? (
                <button className="button primary" disabled={saving || !editForm.label.trim()} onClick={() => void saveEdit()}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
              ) : (
                <button className="button primary" disabled={saving || !form.label.trim()} onClick={() => void createMethod()}>{saving ? 'Guardando...' : 'Crear método'}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
