'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Layers, Plus, ShieldCheck, Star, Trash2, UserRoundCog, Users, Workflow, X } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

// Debe coincidir con MODULE_KEYS en apps/api/src/common/constants/modules.ts.
const MODULE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'conversations', label: 'Conversaciones' },
  { key: 'instances', label: 'WhatsApp' },
  { key: 'team', label: 'Equipo y agentes' },
  { key: 'incidents', label: 'Incidencias' },
  { key: 'calendar', label: 'Calendario' },
  { key: 'api-settings', label: 'API e integraciones' },
  { key: 'feedback', label: 'Sugerencias y reportes' },
  { key: 'crm', label: 'CRM' },
  { key: 'automations', label: 'Automatizaciones' },
];
const ALL_MODULE_KEYS = MODULE_OPTIONS.map((item) => item.key);

type DepartmentRef = { department: { id: string; name: string } };
type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'SUPERVISOR' | 'AGENT';
  active: boolean;
  isDefaultAgent: boolean;
  effectiveDefault: boolean;
  lastLoginAt?: string | null;
  departments?: DepartmentRef[];
  allowedModules?: string[];
};
type Department = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  isDefault: boolean;
  users: Array<{ user: Pick<TeamUser, 'id' | 'name' | 'email' | 'role' | 'active'> }>;
  _count?: { conversations: number };
};
type Stage = { id: string; name: string; color: string; isWon: boolean };
type Project = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  _count?: { conversations: number };
};
const roleNames: Record<TeamUser['role'], string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  AGENT: 'Agente',
};

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  // Error propio de lo que esté abierto en un modal — se muestra ahí mismo, no arriba de
  // la página (donde queda tapado por el fondo oscuro del modal y nadie lo ve).
  const [modalError, setModalError] = useState('');
  const [agentModal, setAgentModal] = useState(false);
  const [editModal, setEditModal] = useState<TeamUser | null>(null);
  const [departmentModal, setDepartmentModal] = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [membersModal, setMembersModal] = useState<Department | null>(null);
  const [stagesModal, setStagesModal] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'department' | 'project'; id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const emptyAgentForm = { name: '', email: '', password: '', role: 'AGENT' as TeamUser['role'], departmentIds: [] as string[], allowedModules: [...ALL_MODULE_KEYS] };
  const [agentForm, setAgentForm] = useState(emptyAgentForm);
  const [editForm, setEditForm] = useState({ name: '', role: 'AGENT' as TeamUser['role'], password: '', departmentIds: [] as string[], allowedModules: [...ALL_MODULE_KEYS] });
  const [departmentForm, setDepartmentForm] = useState({ name: '', description: '' });
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#6b8afd');

  const load = useCallback(async () => {
    try {
      const [teamUsers, teamDepartments, teamProjects] = await Promise.all([
        apiFetch<TeamUser[]>('/team/users'),
        apiFetch<Department[]>('/team/departments'),
        apiFetch<Project[]>('/team/projects'),
      ]);
      setUsers(teamUsers);
      setDepartments(teamDepartments);
      setProjects(teamProjects);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el equipo');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeAgents = useMemo(() => users.filter((user) => user.active), [users]);

  // Chequeo instantáneo contra los usuarios ya cargados de esta empresa — evita el viaje
  // al backend para el caso más común (alguien de la misma empresa). El backend igual
  // valida de nuevo (el correo es único globalmente, no solo por empresa), así que esto
  // es solo para dar feedback inmediato, no reemplaza esa validación.
  const emailTaken = useMemo(() => {
    const email = agentForm.email.trim().toLowerCase();
    if (!email) return false;
    return users.some((user) => user.email.toLowerCase() === email);
  }, [agentForm.email, users]);

  const openAgentModal = () => {
    setModalError('');
    setAgentForm(emptyAgentForm);
    setAgentModal(true);
  };

  const createAgent = async () => {
    if (!agentForm.name.trim()) { setModalError('Ingresa el nombre del agente'); return; }
    if (!agentForm.email.trim()) { setModalError('Ingresa un correo'); return; }
    if (emailTaken) { setModalError('Ya existe un usuario con este correo — usa otro para no duplicar el acceso'); return; }
    if (agentForm.password.length < 10) { setModalError('La contraseña inicial debe tener al menos 10 caracteres'); return; }
    setModalError('');
    setSaving(true);
    try {
      await apiFetch('/team/users', { method: 'POST', body: JSON.stringify(agentForm) });
      setAgentModal(false);
      setAgentForm(emptyAgentForm);
      await load();
    } catch (err) { setModalError(err instanceof Error ? err.message : 'No se pudo crear el usuario'); }
    finally { setSaving(false); }
  };

  const toggleUser = async (user: TeamUser) => {
    try {
      await apiFetch(`/team/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ active: !user.active }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario'); }
  };

  const setDefaultAgent = async (user: TeamUser) => {
    try {
      await apiFetch(`/team/users/${user.id}/default`, { method: 'PATCH' });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo marcar el usuario como predeterminado'); }
  };

  const clearDefaultAgent = async (user: TeamUser) => {
    try {
      await apiFetch(`/team/users/${user.id}/default`, { method: 'DELETE' });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo quitar al usuario como predeterminado'); }
  };

  const toggleDepartment = async (department: Department) => {
    try {
      await apiFetch(`/team/departments/${department.id}`, { method: 'PATCH', body: JSON.stringify({ active: !department.active }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar el departamento'); }
  };

  const setDefaultDepartment = async (department: Department) => {
    try {
      await apiFetch(`/team/departments/${department.id}/default`, { method: 'PATCH' });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo marcar el departamento como predeterminado'); }
  };

  const toggleProject = async (project: Project) => {
    try {
      await apiFetch(`/team/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ active: !project.active }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar el proyecto'); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError('');
    setDeleting(true);
    try {
      await apiFetch(`/team/${deleteTarget.kind === 'department' ? 'departments' : 'projects'}/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se pudo eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (user: TeamUser) => {
    setModalError('');
    setEditModal(user);
    setEditForm({
      name: user.name,
      role: user.role,
      password: '',
      departmentIds: user.departments?.map((item) => item.department.id) ?? [],
      allowedModules: user.allowedModules?.length ? user.allowedModules : [...ALL_MODULE_KEYS],
    });
  };

  const saveEdit = async () => {
    if (!editModal) return;
    if (!editForm.name.trim()) { setModalError('Ingresa el nombre del usuario'); return; }
    setModalError('');
    setSaving(true);
    try {
      await apiFetch(`/team/users/${editModal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name.trim(),
          role: editForm.role,
          departmentIds: editForm.departmentIds,
          allowedModules: editForm.allowedModules,
          ...(editForm.password ? { password: editForm.password } : {}),
        }),
      });
      setEditModal(null);
      await load();
    } catch (err) { setModalError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario'); }
    finally { setSaving(false); }
  };

  const openDepartmentModal = () => { setModalError(''); setDepartmentModal(true); };

  const createDepartment = async () => {
    if (!departmentForm.name.trim()) return;
    setModalError('');
    setSaving(true);
    try {
      await apiFetch('/team/departments', { method: 'POST', body: JSON.stringify(departmentForm) });
      setDepartmentModal(false);
      setDepartmentForm({ name: '', description: '' });
      await load();
    } catch (err) { setModalError(err instanceof Error ? err.message : 'No se pudo crear el departamento'); }
    finally { setSaving(false); }
  };

  const openProjectModal = () => { setModalError(''); setProjectModal(true); };

  const createProject = async () => {
    if (!projectForm.name.trim()) return;
    setModalError('');
    setSaving(true);
    try {
      await apiFetch('/team/projects', { method: 'POST', body: JSON.stringify(projectForm) });
      setProjectModal(false);
      setProjectForm({ name: '', description: '' });
      await load();
    } catch (err) { setModalError(err instanceof Error ? err.message : 'No se pudo crear el proyecto'); }
    finally { setSaving(false); }
  };

  const openMembers = (department: Department) => {
    setModalError('');
    setMembersModal(department);
    setMemberIds(department.users.map((item) => item.user.id));
  };

  const saveMembers = async () => {
    if (!membersModal) return;
    setModalError('');
    setSaving(true);
    try {
      await apiFetch(`/team/departments/${membersModal.id}/members`, { method: 'PUT', body: JSON.stringify({ userIds: memberIds }) });
      setMembersModal(null);
      await load();
    } catch (err) { setModalError(err instanceof Error ? err.message : 'No se pudieron guardar los miembros'); }
    finally { setSaving(false); }
  };

  const openStages = async (department: Department) => {
    setModalError('');
    setStagesModal(department);
    setNewStageName('');
    try { setStages(await apiFetch<Stage[]>(`/team/departments/${department.id}/stages`)); }
    catch { setStages([]); }
  };

  const createStage = async () => {
    if (!stagesModal || !newStageName.trim()) return;
    setModalError('');
    setSaving(true);
    try {
      const stage = await apiFetch<Stage>(`/team/departments/${stagesModal.id}/stages`, { method: 'POST', body: JSON.stringify({ name: newStageName.trim(), color: newStageColor }) });
      setStages((current) => [...current, stage]);
      setNewStageName('');
    } catch (err) { setModalError(err instanceof Error ? err.message : 'No se pudo crear la etapa'); }
    finally { setSaving(false); }
  };

  const removeStage = async (id: string) => {
    setStages((current) => current.filter((item) => item.id !== id));
    try { await apiFetch(`/team/stages/${id}`, { method: 'DELETE' }); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo eliminar la etapa'); }
  };

  const toggleStageWon = async (stage: Stage) => {
    setStages((current) => current.map((item) => item.id === stage.id ? { ...item, isWon: !item.isWon } : item));
    try { await apiFetch(`/team/stages/${stage.id}`, { method: 'PATCH', body: JSON.stringify({ isWon: !stage.isWon }) }); }
    catch (err) {
      setStages((current) => current.map((item) => item.id === stage.id ? { ...item, isWon: stage.isWon } : item));
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la etapa');
    }
  };

  return (
    <AppShell
      title="Equipo y agentes"
      subtitle="Usuarios, roles y departamentos que atenderán las conversaciones"
      actions={<button className="button primary" onClick={openAgentModal}><Plus size={16} />Nuevo agente</button>}
    >
      {error && <div className="error-box">{error}</div>}

      <div className="grid-stats team-stats">
        <div className="stat-card"><div className="stat-icon"><Users size={19} /></div><div className="stat-label">Usuarios activos</div><div className="stat-value">{activeAgents.length}</div><div className="stat-meta">Personas con acceso al panel</div></div>
        <div className="stat-card"><div className="stat-icon"><Building2 size={19} /></div><div className="stat-label">Departamentos</div><div className="stat-value">{departments.filter((item) => item.active).length}</div><div className="stat-meta">Ventas, soporte, cobranzas, etc.</div></div>
        <div className="stat-card"><div className="stat-icon"><Layers size={19} /></div><div className="stat-label">Proyectos</div><div className="stat-value">{projects.filter((item) => item.active).length}</div><div className="stat-meta">Productos que soportas o vendes</div></div>
        <div className="stat-card"><div className="stat-icon"><ShieldCheck size={19} /></div><div className="stat-label">Administradores</div><div className="stat-value">{users.filter((item) => item.active && ['OWNER', 'ADMIN'].includes(item.role)).length}</div><div className="stat-meta">Usuarios con permisos de gestión</div></div>
      </div>

      <div className="team-layout">
        <section className="table-card">
          <div className="card-header"><div><h2>Agentes y usuarios</h2><p>El mismo usuario puede iniciar sesión y atender el chat en vivo.</p></div></div>
          <table>
            <thead><tr><th>Usuario</th><th>Rol</th><th>Departamentos</th><th>Estado</th><th>Por Defecto</th><th></th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><span className="row-main">{user.name}</span><span className="row-sub">{user.email}</span></td>
                  <td>{roleNames[user.role]}</td>
                  <td>{user.departments?.length ? user.departments.map((item) => item.department.name).join(', ') : '—'}</td>
                  <td><span className={`status-pill ${user.active ? 'success' : 'neutral'}`}><span className="status-dot" />{user.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                    {user.effectiveDefault ? (
                      <span className="default-badge" title={user.isDefaultAgent ? 'Se asigna como responsable a los leads nuevos' : 'Único agente activo: predeterminado automáticamente'}><Star size={11} />Predeterminado</span>
                    ) : user.active ? (
                      <button className="button small" title="Asignar como responsable a los leads nuevos" onClick={() => void setDefaultAgent(user)}><Star size={13} />Fijar por defecto</button>
                    ) : '—'}
                    {user.effectiveDefault && user.isDefaultAgent && (
                      <button className="icon-button" title="Quitar como predeterminado" onClick={() => void clearDefaultAgent(user)}><X size={12} /></button>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                    <button className="button small" onClick={() => openEdit(user)}>Editar</button>
                    <button className={`button small ${user.active ? '' : 'primary'}`} onClick={() => void toggleUser(user)}>{user.active ? 'Desactivar' : 'Activar'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="team-side-stack">
          <section className="card">
            <div className="card-header"><div><h2>Departamentos</h2><p>Organiza la atención por área.</p></div><button className="button small" onClick={openDepartmentModal}><Plus size={14} />Crear</button></div>
            <div className="card-body department-list">
              {departments.map((department) => (
                <div className={`department-row ${department.active ? '' : 'inactive'}`} key={department.id}>
                  <div className="department-icon"><Building2 size={17} /></div>
                  <div className="department-copy"><strong>{department.name}</strong><span>{department.description || 'Sin descripción'} · {department.users.length} miembro(s){!department.active && ' · Inactivo'}</span></div>
                  <div className="department-row-actions">
                    {department.isDefault ? (
                      <span className="default-badge" title="Se asigna automáticamente a las conversaciones nuevas"><Star size={11} />Predeterminado</span>
                    ) : department.active ? (
                      <button className="button small" title="Asignar automáticamente a las conversaciones nuevas" onClick={() => void setDefaultDepartment(department)}><Star size={13} />Fijar por defecto</button>
                    ) : null}
                    <button className="button small" onClick={() => void openStages(department)}><Workflow size={13} />Etapas</button>
                    <button className="button small" onClick={() => openMembers(department)}>Miembros</button>
                    <button className={`button small ${department.active ? 'danger' : 'primary'}`} onClick={() => void toggleDepartment(department)}>{department.active ? 'Desactivar' : 'Activar'}</button>
                    <button className="icon-button" title="Eliminar departamento" onClick={() => { setDeleteError(''); setDeleteTarget({ kind: 'department', id: department.id, name: department.name }); }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {!departments.length && <div className="empty-state"><div><strong>Aún no hay departamentos</strong>Crea Ventas, Soporte, Facturación u otras áreas.</div></div>}
            </div>
          </section>

          <section className="card">
            <div className="card-header"><div><h2>Proyectos</h2><p>De qué producto habla el cliente, para dar soporte o vender.</p></div><button className="button small" onClick={openProjectModal}><Plus size={14} />Crear</button></div>
            <div className="card-body department-list">
              {projects.map((project) => (
                <div className={`department-row ${project.active ? '' : 'inactive'}`} key={project.id}>
                  <div className="department-icon"><Layers size={17} /></div>
                  <div className="department-copy"><strong>{project.name}</strong><span>{project.description || 'Sin descripción'} · {project._count?.conversations || 0} conversación(es){!project.active && ' · Inactivo'}</span></div>
                  <div className="department-row-actions">
                    <button className={`button small ${project.active ? 'danger' : 'primary'}`} onClick={() => void toggleProject(project)}>{project.active ? 'Desactivar' : 'Activar'}</button>
                    <button className="icon-button" title="Eliminar proyecto" onClick={() => { setDeleteError(''); setDeleteTarget({ kind: 'project', id: project.id, name: project.name }); }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {!projects.length && <div className="empty-state"><div><strong>Aún no hay proyectos</strong>Crea mipse, misire, tuefact, brainpos, dominios, vps, etc.</div></div>}
            </div>
          </section>
        </div>
      </div>

      {agentModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header"><h2>Nuevo agente</h2><p>Crea un acceso para una persona que atenderá conversaciones.</p></div>
            <div className="modal-body">
              {modalError && <div className="error-box">{modalError}</div>}
              <div className="form-grid">
                <div className="field"><label>Nombre</label><input value={agentForm.name} onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })} placeholder="Carlos Soporte" /></div>
                <div className="field">
                  <label>Correo</label>
                  <input type="email" value={agentForm.email} onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })} placeholder="carlos@empresa.com" style={emailTaken ? { borderColor: 'var(--danger)' } : undefined} />
                  {emailTaken && <p className="field-hint" style={{ color: 'var(--danger)' }}>Ya existe un usuario con este correo — usa otro para no duplicar el acceso.</p>}
                </div>
                <div className="field"><label>Contraseña inicial</label><input type="password" value={agentForm.password} onChange={(e) => setAgentForm({ ...agentForm, password: e.target.value })} placeholder="Mínimo 10 caracteres" /></div>
                <div className="field"><label>Rol</label><select value={agentForm.role} onChange={(e) => setAgentForm({ ...agentForm, role: e.target.value as TeamUser['role'] })}><option value="AGENT">Agente</option><option value="SUPERVISOR">Supervisor</option><option value="ADMIN">Administrador</option></select></div>
              </div>
              {agentForm.role === 'AGENT' && (
                <>
                  <div className="field" style={{ marginTop: '1rem' }}>
                    <label>Departamento(s)</label>
                    <p className="field-hint">El agente solo verá las conversaciones de estos departamentos (además de las que aún no tienen departamento asignado).</p>
                    <div className="member-picker">
                      {departments.filter((d) => d.active).map((department) => (
                        <label className="member-option" key={department.id}>
                          <input type="checkbox" checked={agentForm.departmentIds.includes(department.id)} onChange={(e) => setAgentForm({ ...agentForm, departmentIds: e.target.checked ? [...agentForm.departmentIds, department.id] : agentForm.departmentIds.filter((id) => id !== department.id) })} />
                          <div><strong>{department.name}</strong></div>
                        </label>
                      ))}
                      {!departments.length && <p className="contact-empty-hint">Aún no hay departamentos creados.</p>}
                    </div>
                  </div>
                  <div className="field" style={{ marginTop: '1rem' }}>
                    <label>Módulos visibles</label>
                    <p className="field-hint">Qué secciones del menú puede ver este agente.</p>
                    <div className="member-picker">
                      {MODULE_OPTIONS.map((module) => (
                        <label className="member-option" key={module.key}>
                          <input type="checkbox" checked={agentForm.allowedModules.includes(module.key)} onChange={(e) => setAgentForm({ ...agentForm, allowedModules: e.target.checked ? [...agentForm.allowedModules, module.key] : agentForm.allowedModules.filter((key) => key !== module.key) })} />
                          <div><strong>{module.label}</strong></div>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-actions"><button className="button" onClick={() => setAgentModal(false)}>Cancelar</button><button className="button primary" disabled={saving || emailTaken} onClick={() => void createAgent()}>{saving ? 'Guardando...' : 'Crear usuario'}</button></div>
          </div>
        </div>
      )}

      {editModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header"><h2>Editar usuario</h2><p>{editModal.name} · {editModal.email}</p></div>
            <div className="modal-body">
              {modalError && <div className="error-box">{modalError}</div>}
              <div className="form-grid">
                <div className="field"><label>Nombre</label><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Carlos Soporte" /></div>
                <div className="field"><label>Rol</label><select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as TeamUser['role'] })}><option value="AGENT">Agente</option><option value="SUPERVISOR">Supervisor</option><option value="ADMIN">Administrador</option><option value="OWNER">Propietario</option></select></div>
                <div className="field"><label>Nueva contraseña (opcional)</label><input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="Dejar en blanco para no cambiarla" /></div>
              </div>
              {editForm.role === 'AGENT' && (
                <>
                  <div className="field" style={{ marginTop: '1rem' }}>
                    <label>Departamento(s)</label>
                    <p className="field-hint">El agente solo verá las conversaciones de estos departamentos (además de las que aún no tienen departamento asignado).</p>
                    <div className="member-picker">
                      {departments.filter((d) => d.active).map((department) => (
                        <label className="member-option" key={department.id}>
                          <input type="checkbox" checked={editForm.departmentIds.includes(department.id)} onChange={(e) => setEditForm({ ...editForm, departmentIds: e.target.checked ? [...editForm.departmentIds, department.id] : editForm.departmentIds.filter((id) => id !== department.id) })} />
                          <div><strong>{department.name}</strong></div>
                        </label>
                      ))}
                      {!departments.length && <p className="contact-empty-hint">Aún no hay departamentos creados.</p>}
                    </div>
                  </div>
                  <div className="field" style={{ marginTop: '1rem' }}>
                    <label>Módulos visibles</label>
                    <p className="field-hint">Qué secciones del menú puede ver este agente.</p>
                    <div className="member-picker">
                      {MODULE_OPTIONS.map((module) => (
                        <label className="member-option" key={module.key}>
                          <input type="checkbox" checked={editForm.allowedModules.includes(module.key)} onChange={(e) => setEditForm({ ...editForm, allowedModules: e.target.checked ? [...editForm.allowedModules, module.key] : editForm.allowedModules.filter((key) => key !== module.key) })} />
                          <div><strong>{module.label}</strong></div>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-actions"><button className="button" onClick={() => setEditModal(null)}>Cancelar</button><button className="button primary" disabled={saving} onClick={() => void saveEdit()}>{saving ? 'Guardando...' : 'Guardar cambios'}</button></div>
          </div>
        </div>
      )}

      {departmentModal && <div className="modal-backdrop"><div className="modal"><div className="modal-header"><h2>Nuevo departamento</h2><p>Permite agrupar agentes y transferir conversaciones por área.</p></div><div className="modal-body">{modalError && <div className="error-box">{modalError}</div>}<div className="form-grid"><div className="field"><label>Nombre</label><input value={departmentForm.name} onChange={(e) => setDepartmentForm({ ...departmentForm, name: e.target.value })} placeholder="Soporte" /></div><div className="field"><label>Descripción</label><textarea value={departmentForm.description} onChange={(e) => setDepartmentForm({ ...departmentForm, description: e.target.value })} placeholder="Atención técnica de BrainPOS y ERP" /></div></div></div><div className="modal-actions"><button className="button" onClick={() => setDepartmentModal(false)}>Cancelar</button><button className="button primary" disabled={saving} onClick={() => void createDepartment()}>{saving ? 'Guardando...' : 'Crear departamento'}</button></div></div></div>}

      {projectModal && <div className="modal-backdrop"><div className="modal"><div className="modal-header"><h2>Nuevo proyecto</h2><p>Un producto que soportas o vendes (ej. BrainPOS, dominios, VPS).</p></div><div className="modal-body">{modalError && <div className="error-box">{modalError}</div>}<div className="form-grid"><div className="field"><label>Nombre</label><input value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} placeholder="BrainPOS" /></div><div className="field"><label>Descripción</label><textarea value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} placeholder="Sistema de punto de venta" /></div></div></div><div className="modal-actions"><button className="button" onClick={() => setProjectModal(false)}>Cancelar</button><button className="button primary" disabled={saving} onClick={() => void createProject()}>{saving ? 'Guardando...' : 'Crear proyecto'}</button></div></div></div>}

      {membersModal && <div className="modal-backdrop"><div className="modal"><div className="modal-header"><h2>Miembros de {membersModal.name}</h2><p>Selecciona qué agentes pertenecen a este departamento.</p></div><div className="modal-body">{modalError && <div className="error-box">{modalError}</div>}<div className="member-picker">{activeAgents.map((user) => <label className="member-option" key={user.id}><input type="checkbox" checked={memberIds.includes(user.id)} onChange={(e) => setMemberIds((current) => e.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} /><div><strong>{user.name}</strong><span>{user.email} · {roleNames[user.role]}</span></div></label>)}</div></div><div className="modal-actions"><button className="button" onClick={() => setMembersModal(null)}>Cancelar</button><button className="button primary" disabled={saving} onClick={() => void saveMembers()}>{saving ? 'Guardando...' : 'Guardar miembros'}</button></div></div></div>}

      {stagesModal && (
        <div className="modal-backdrop" onClick={() => setStagesModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Etapas de {stagesModal.name}</h2><p>El pipeline propio de este departamento. Los agentes solo verán estas etapas al atender conversaciones asignadas a {stagesModal.name}.</p></div>
            <div className="modal-body">
              {modalError && <div className="error-box">{modalError}</div>}
              <div className="stage-list">
                {stages.map((stage) => (
                  <div className="stage-row" key={stage.id}>
                    <span className="stage-row-dot" style={{ background: stage.color }} />
                    <strong>{stage.name}</strong>
                    <label className="stage-won-toggle" title="Marcar como ganada en el Kanban de Pipelines">
                      <input type="checkbox" checked={stage.isWon} onChange={() => void toggleStageWon(stage)} />
                      Ganada
                    </label>
                    <button className="icon-button" onClick={() => void removeStage(stage.id)} title="Eliminar etapa"><Trash2 size={14} /></button>
                  </div>
                ))}
                {!stages.length && <p className="contact-empty-hint">Aún no hay etapas. Ej: Nuevo, Contactado, Calificado, Ganado, Perdido.</p>}
              </div>
              <div className="stage-add">
                <input type="color" value={newStageColor} onChange={(e) => setNewStageColor(e.target.value)} title="Color" />
                <input value={newStageName} onChange={(e) => setNewStageName(e.target.value)} placeholder="Nombre de la etapa..." onKeyDown={(e) => { if (e.key === 'Enter') void createStage(); }} />
                <button className="button small" disabled={saving || !newStageName.trim()} onClick={() => void createStage()}><Plus size={13} />Agregar</button>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button primary" onClick={() => setStagesModal(null)}>Listo</button>
            </div>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Eliminar {deleteTarget.kind === 'department' ? 'departamento' : 'proyecto'}</h2>
              <p>¿Eliminar &quot;{deleteTarget.name}&quot;? Esta acción no se puede deshacer.</p>
            </div>
            <div className="modal-body">
              {deleteError && <div className="error-box">{deleteError}</div>}
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button className="button danger" disabled={deleting} onClick={() => void confirmDelete()}>{deleting ? 'Eliminando...' : 'Eliminar'}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
