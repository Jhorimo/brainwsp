import type { UserRole } from '@prisma/client';

export interface JwtUser {
  sub: string;
  companyId: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface ApiClientContext {
  credentialId: string;
  companyId: string;
  instanceId: string | null;
  appKey: string;
}
