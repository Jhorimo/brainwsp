import { Body, Controller, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StorageService } from '../storage/storage.service';
import type { JwtUser } from '../common/types/jwt-user';
import { BillingService } from './billing.service';
import { pipeToResponse } from '../common/pipe-stream';

const MAX_PROOF_BYTES = 16 * 1024 * 1024;

// "Mi Plan" — gestión de la suscripción de la PROPIA empresa. Va con Roles en vez de
// RequireModule (a diferencia de dashboard/conversations/etc): billing no es un permiso
// granular que un OWNER le prenda/apague a un agente, es del dueño de la cuenta.
@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly service: BillingService,
    private readonly storage: StorageService,
  ) {}

  @Get('plans')
  plans() {
    return this.service.listPlans();
  }

  @Get('payment-methods')
  paymentMethods() {
    return this.service.listPaymentMethods();
  }

  // Streams the QR back through the API — la URL de MinIO no es alcanzable desde el navegador.
  @Get('payment-methods/:id/qr')
  async paymentMethodQr(@Param('id') id: string, @Res() res: Response) {
    const objectName = await this.service.getPaymentMethodQrObjectName(id);
    const stream = await this.storage.getObjectStream(objectName);
    pipeToResponse(stream, res);
  }

  @Get('payment-requests')
  paymentRequests(@CurrentUser() user: JwtUser) {
    return this.service.listPaymentRequests(user.companyId);
  }

  @Post('payment-requests')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PROOF_BYTES } }))
  createPaymentRequest(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('planId') planId?: string,
    @Body('paymentMethodId') paymentMethodId?: string,
    @Body('whatsappPhone') whatsappPhone?: string,
  ) {
    return this.service.createPaymentRequest(user.companyId, { planId, paymentMethodId, whatsappPhone, file });
  }
}
