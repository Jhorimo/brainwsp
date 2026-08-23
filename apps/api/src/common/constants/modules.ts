export const MODULE_KEYS = ['dashboard', 'conversations', 'instances', 'team', 'incidents', 'api-settings', 'feedback'] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
