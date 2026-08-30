// Debe coincidir con MODULE_KEYS en apps/api/src/common/constants/modules.ts.
export const MODULE_OPTIONS: Array<{ key: string; label: string }> = [
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

export const ALL_MODULE_KEYS = MODULE_OPTIONS.map((item) => item.key);
