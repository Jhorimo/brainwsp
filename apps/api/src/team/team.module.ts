import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  controllers: [TeamController],
  providers: [TeamService, RolesGuard],
  exports: [TeamService],
})
export class TeamModule {}
