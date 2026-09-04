import { SetMetadata } from '@nestjs/common';
import type { ModuleKey } from '../constants/modules';

export const REQUIRE_MODULE_KEY = 'brainwsp:module';
// Un array significa "cualquiera de estos alcanza" — para un controller cuyas rutas sirven a
// más de un módulo visible en el menú (p. ej. automations: el constructor de flujos y la
// galería de plantillas comparten los mismos endpoints de folders/flows, ver AutomationsController).
export const RequireModule = (module: ModuleKey | ModuleKey[]) => SetMetadata(REQUIRE_MODULE_KEY, module);
