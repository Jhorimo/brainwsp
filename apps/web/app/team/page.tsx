'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Layers, Plus, ShieldCheck, UserRoundCog, Users } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type DepartmentRef = { department: { id: string; name: string } };
type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'SUPERVISOR' | 'AGENT';
  active: boolean;
  lastLoginAt?: string | null;
  departments?: DepartmentRef[];
};
type Department = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  users: Array<{ user: Pick<TeamUser, 'id' | 'name' | 'email' | 'role' | 'active'> }>;
  _count?: { conversations: number };
};
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
  const [agentModal, setAgentModal] = useState(false);
  const [departmentModal, setDepartmentModal] = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [membersModal, setMembersModal] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);

  const [agentForm, setAgentForm] = useState({ name: '', email: '', password: '', role: 'AGENT' as TeamUser['role'] });
  const [departmentForm, setDepartmentForm] = useState({ name: '', description: '' });
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [memberIds, setMemberIds] = useState<string[]>([]);

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

  const createAgent = async () => {
    if (!agentForm.name.trim() || !agentForm.email.trim() || agentForm.password.length < 10) return;
    setSaving(true);
    try {
      await apiFetch('/team/users', { method: 'POST', body: JSON.stringify(agentForm) });
      setAgentModal(false);
      setAgentForm({ name: '', email: '', password: '', role: 'AGENT' });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear el usuario'); }
    finally { setSaving(false); }
  };

  const toggleUser = async (user: TeamUser) => {
    try {
      await apiFetch(`/team/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ active: !user.active }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario'); }
  };

  const createDepartment = async () => {
    if (!departmentForm.name.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/team/departments', { method: 'POST', body: JSON.stringify(departmentForm) });
      setDepartmentModal(false);
      setDepartmentForm({ name: '', description: '' });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear el departamento'); }
    finally { setSaving(false); }
  };

  const createProject = async () => {
    if (!projectForm.name.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/team/projects', { method: 'POST', body: JSON.stringify(projectForm) });
      setProjectModal(false);
      setProjectForm({ name: '', description: '' });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear el proyecto'); }
    finally { setSaving(false); }
  };

  const openMembers = (department: Department) => {
    setMembersModal(department);
    setMemberIds(department.users.map((item) => item.user.id));
  };

  const saveMembers = async () => {
    if (!membersModal) return;
    setSaving(true);
    try {
      await apiFetch(`/team/departments/${membersModal.id}/members`, { method: 'PUT', body: JSON.stringify({ userIds: memberIds }) });
      setMembersModal(null);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron guardar los miembros'); }
    finally { setSaving(false); }
  };

  return (
    <AppShell
      title="Equipo y agentes"
      subtitle="Usuarios, roles y departamentos que atenderán las conversaciones"
      actions={<button className="button primary" onClick={() => setAgentModal(true)}><Plus size={16} />Nuevo agente</button>}
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
            <thead><tr><th>Usuario</th><th>Rol</th><th>Departamentos</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><span className="row-main">{user.name}</span><span className="row-sub">{user.email}</span></td>
                  <td>{roleNames[user.role]}</td>
                  <td>{user.departments?.length ? user.departments.map((item) => item.department.name).join(', ') : '—'}</td>
                  <td><span className={`status-pill ${user.active ? 'success' : 'neutral'}`}><span className="status-dot" />{user.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td style={{ textAlign: 'right' }}><button className={`button small ${user.active ? '' : 'primary'}`} onClick={() => void toggleUser(user)}>{user.active ? 'Desactivar' : 'Activar'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="team-side-stack">
          <section className="card">
            <div className="card-header"><div><h2>Departamentos</h2><p>Organiza la atención por área.</p></div><button className="button small" onClick={() => setDepartmentModal(true)}><Plus size={14} />Crear</button></div>
            <div className="card-body department-list">
              {departments.map((department) => (
                <div className="department-row" key={department.id}>
                  <div className="department-icon"><Building2 size={17} /></div>
                  <div className="department-copy"><strong>{department.name}</strong><span>{department.description || 'Sin descripción'} · {department.users.length} miembro(s)</span></div>
                  <button className="button small" onClick={() => openMembers(department)}>Miembros</button>
                </div>
              ))}
              {!departments.length && <div className="empty-state"><div><strong>Aún no hay departamentos</strong>Crea Ventas, Soporte, Facturación u otras áreas.</div></div>}
            </div>
          </section>

          <section className="card">
            <div className="card-header"><div><h2>Proyectos</h2><p>De qué producto habla el cliente, para dar soporte o vender.</p></div><button className="button small" onClick={() => setProjectModal(true)}><Plus size={14} />Crear</button></div>
            <div className="card-body department-list">
              {projects.map((project) => (
                <div className="department-row" key={project.id}>
                  <div className="department-icon"><Layers size={17} /></div>
                  <div className="department-copy"><strong>{project.name}</strong><span>{project.description || 'Sin descripción'} · {project._count?.conversations || 0} conversación(es)</span></div>
                </div>
              ))}
              {!projects.length && <div className="empty-state"><div><strong>Aún no hay proyectos</strong>Crea mipse, misire, tuefact, brainpos, dominios, vps, etc.</div></div>}
            </div>
          </section>
        </div>
      </div>

      {agentModal && <div className="modal-backdrop"><div className="modal"><div className="modal-header"><h2>Nuevo agente</h2><p>Crea un acceso para una persona que atenderá conversaciones.</p></div><div className="modal-body"><div className="form-grid"><div className="field"><label>Nombre</label><input value={agentForm.name} onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })} placeholder="Carlos Soporte" /></div><div className="field"><label>Correo</label><input type="email" value={agentForm.email} onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })} placeholder="carlos@empresa.com" /></div><div className="field"><label>Contraseña inicial</label><input type="password" value={agentForm.password} onChange={(e) => setAgentForm({ ...agentForm, password: e.target.value })} placeholder="Mínimo 10 caracteres" /></div><div className="field"><label>Rol</label><select value={agentForm.role} onChange={(e) => setAgentForm({ ...agentForm, role: e.target.value as TeamUser['role'] })}><option value="AGENT">Agente</option><option value="SUPERVISOR">Supervisor</option><option value="ADMIN">Administrador</option></select></div></div></div><div className="modal-actions"><button className="button" onClick={() => setAgentModal(false)}>Cancelar</button><button className="button primary" disabled={saving} onClick={() => void createAgent()}>{saving ? 'Guardando...' : 'Crear usuario'}</button></div></div></div>}

      {departmentModal && <div className="modal-backdrop"><div className="modal"><div className="modal-header"><h2>Nuevo departamento</h2><p>Permite agrupar agentes y transferir conversaciones por área.</p></div><div className="modal-body"><div className="form-grid"><div className="field"><label>Nombre</label><input value={departmentForm.name} onChange={(e) => setDepartmentForm({ ...departmentForm, name: e.target.value })} placeholder="Soporte" /></div><div className="field"><label>Descripción</label><textarea value={departmentForm.description} onChange={(e) => setDepartmentForm({ ...departmentForm, description: e.target.value })} placeholder="Atención técnica de BrainPOS y ERP" /></div></div></div><div className="modal-actions"><button className="button" onClick={() => setDepartmentModal(false)}>Cancelar</button><button className="button primary" disabled={saving} onClick={() => void createDepartment()}>{saving ? 'Guardando...' : 'Crear departamento'}</button></div></div></div>}

      {projectModal && <div className="modal-backdrop"><div className="modal"><div className="modal-header"><h2>Nuevo proyecto</h2><p>Un producto que soportas o vendes (ej. BrainPOS, dominios, VPS).</p></div><div className="modal-body"><div className="form-grid"><div className="field"><label>Nombre</label><input value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} placeholder="BrainPOS" /></div><div className="field"><label>Descripción</label><textarea value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} placeholder="Sistema de punto de venta" /></div></div></div><div className="modal-actions"><button className="button" onClick={() => setProjectModal(false)}>Cancelar</button><button className="button primary" disabled={saving} onClick={() => void createProject()}>{saving ? 'Guardando...' : 'Crear proyecto'}</button></div></div></div>}

      {membersModal && <div className="modal-backdrop"><div className="modal"><div className="modal-header"><h2>Miembros de {membersModal.name}</h2><p>Selecciona qué agentes pertenecen a este departamento.</p></div><div className="modal-body"><div className="member-picker">{activeAgents.map((user) => <label className="member-option" key={user.id}><input type="checkbox" checked={memberIds.includes(user.id)} onChange={(e) => setMemberIds((current) => e.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} /><div><strong>{user.name}</strong><span>{user.email} · {roleNames[user.role]}</span></div></label>)}</div></div><div className="modal-actions"><button className="button" onClick={() => setMembersModal(null)}>Cancelar</button><button className="button primary" disabled={saving} onClick={() => void saveMembers()}>{saving ? 'Guardando...' : 'Guardar miembros'}</button></div></div></div>}
    </AppShell>
  );
}
