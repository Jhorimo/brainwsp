// 'crm-leads'/'crm-deals'/'crm-pipelines' reemplazan al antiguo 'crm' plano (ver migración
// split_crm_module_key) — cada uno gatea su propio controller para poder prender/apagar
// Prospectos, Tratos y Pipelines de forma independiente desde /admin/clients.
//
// 'automations-flows'/'automations-templates' reemplazan al antiguo 'automations' plano (ver
// migración split_automations_module_key) — el constructor de flujos y la galería de plantillas
// son items de menú separados, pero comparten los mismos endpoints de AutomationsController
// (crear/editar un flujo es la misma acción venga del builder o de "usar plantilla"), así que
// ese controller exige "cualquiera de los dos" en vez de tener un permiso propio por ruta.
export const MODULE_KEYS = ['dashboard', 'conversations', 'instances', 'team', 'incidents', 'calendar', 'api-settings', 'feedback', 'crm-leads', 'crm-deals', 'crm-pipelines', 'automations-flows', 'automations-templates'] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
