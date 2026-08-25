export const MODULE_KEYS = ['dashboard', 'conversations', 'instances', 'team', 'incidents', 'api-settings', 'feedback', 'crm'] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
