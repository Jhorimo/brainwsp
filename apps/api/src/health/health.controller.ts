import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      ok: true,
      service: 'brainwsp-api',
      // Commit + fecha del build que generó esta imagen (ver docker-compose.yml/deploy.sh) —
      // "dev" fuera de Docker (npm run dev), donde no hay build que lo haya inyectado.
      version: process.env.APP_VERSION || 'dev',
      timestamp: new Date().toISOString(),
    };
  }
}
