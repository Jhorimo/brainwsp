import { SetMetadata } from '@nestjs/common';
import type { ModuleKey } from '../constants/modules';

export const REQUIRE_MODULE_KEY = 'brainwsp:module';
export const RequireModule = (module: ModuleKey) => SetMetadata(REQUIRE_MODULE_KEY, module);
