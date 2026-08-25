import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import type { JwtUser } from '../common/types/jwt-user';
import { PipelinesService } from './pipelines.service';

// Los Pipelines del CRM son los Departamentos de la empresa — sus Etapas se gestionan
// desde "Equipo y agentes → Etapas" (ver TeamController), no aquí.
@ApiTags('CRM — Pipelines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequireModule('crm')
@Controller('crm/pipelines')
export class PipelinesController {
  constructor(private readonly service: PipelinesService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.companyId);
  }
}
