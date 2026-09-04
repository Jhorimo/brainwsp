// Debe coincidir con MODULE_KEYS en apps/api/src/common/constants/modules.ts.
// Un nodo con `children` es un grupo puramente visual (p. ej. "CRM"): no tiene su propio
// permiso, solo agrupa y expande/colapsa sus hijos, que sí son módulos reales gateados en la API.
export type ModuleNode = { key: string; label: string; children?: ModuleNode[] };

export const MODULE_TREE: ModuleNode[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'conversations', label: 'Conversaciones' },
  { key: 'instances', label: 'WhatsApp' },
  { key: 'team', label: 'Equipo y agentes' },
  { key: 'incidents', label: 'Incidencias' },
  { key: 'calendar', label: 'Calendario' },
  { key: 'api-settings', label: 'API e integraciones' },
  { key: 'feedback', label: 'Sugerencias y reportes' },
  {
    key: 'crm', label: 'CRM', children: [
      { key: 'crm-leads', label: 'Prospectos' },
      { key: 'crm-deals', label: 'Tratos' },
      { key: 'crm-pipelines', label: 'Pipelines' },
    ],
  },
  {
    key: 'automations', label: 'Automatizaciones', children: [
      { key: 'automations-flows', label: 'Constructor de flujos' },
      { key: 'automations-templates', label: 'Galería de Plantillas' },
    ],
  },
];

// Lista plana de los módulos que son permisos reales (excluye grupos puramente visuales
// como 'crm', que nunca aparece en moduleKeys/moduleOverrides).
export const MODULE_OPTIONS: Array<{ key: string; label: string }> = MODULE_TREE.flatMap((node) => node.children ?? [node]);

export const ALL_MODULE_KEYS = MODULE_OPTIONS.map((item) => item.key);
