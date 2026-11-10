import { Body, Controller, HttpCode, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtUser } from '../common/types/jwt-user';

// Diagnóstico TEMPORAL del chat que "se queda arriba" al abrirlo. La web manda como máximo
// un reporte por chat abierto; aquí solo se escribe una línea en el log (sin tablas, sin
// contenido de mensajes ni teléfonos). Leer con: logs api | grep SCROLL_REPORT. Quitar
// cuando se aplique la corrección.
const ALLOWED = ['reason', 'conversationId', 'gapPx', 'growthPx', 'pendingMedia', 'msgCount', 'lastWriter', 'elapsedMs', 'mobile', 'ua', 'events'];

@ApiTags('Diagnostics')
@Controller('diagnostics')
export class ScrollReportController {
  private readonly logger = new Logger('ScrollReport');

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('scroll')
  @HttpCode(204)
  report(@CurrentUser() user: JwtUser, @Body() body: Record<string, unknown>) {
    const clean: Record<string, unknown> = { company: user.companyId, user: user.sub };
    for (const key of ALLOWED) {
      const v = body?.[key];
      if (typeof v === 'number' || typeof v === 'boolean') clean[key] = v;
      else if (typeof v === 'string') clean[key] = v.slice(0, key === 'events' ? 600 : 160);
    }
    this.logger.log(`SCROLL_REPORT ${JSON.stringify(clean)}`);
  }
}
