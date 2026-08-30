import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';
import { extname } from 'path';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StorageService } from '../storage/storage.service';
import type { JwtUser } from '../common/types/jwt-user';
import { AdminService } from './admin.service';
import { CreatePaymentMethodDto, CreatePlanDto, RejectPaymentRequestDto, UpdateCompanyAdminDto, UpdatePaymentMethodDto, UpdatePlanDto } from './admin.dto';

const MAX_PROOF_BYTES = 16 * 1024 * 1024;

// Everything here reaches across every tenant company — gated to SUPERADMIN only,
// unlike the rest of the API where access is scoped to the caller's own company.
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly storage: StorageService,
  ) {}

  @Get('companies')
  companies() {
    return this.service.listCompanies();
  }

  @Patch('companies/:id')
  updateCompany(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateCompanyAdminDto, @Req() req: Request) {
    return this.service.updateCompany(user.sub, id, dto, req.ip, String(req.headers['user-agent'] || ''));
  }

  @Post('companies/:id/impersonate')
  impersonate(@CurrentUser() user: JwtUser, @Param('id') id: string, @Req() req: Request) {
    return this.service.impersonate(user.sub, user.name, id, req.ip, String(req.headers['user-agent'] || ''));
  }

  @Get('plans')
  plans() {
    return this.service.listPlans();
  }

  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.service.createPlan(dto);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.service.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  deletePlan(@Param('id') id: string) {
    return this.service.deletePlan(id);
  }

  @Get('suggestions')
  suggestions() {
    return this.service.listSuggestions();
  }

  @Get('security-log')
  securityLog(@Query('q') q?: string, @Query('event') event?: string, @Query('status') status?: 'success' | 'failed') {
    return this.service.listSecurityLog({ q, event, status });
  }

  // --- Métodos de pago manual ---

  @Get('payment-methods')
  paymentMethods() {
    return this.service.listPaymentMethods();
  }

  @Post('payment-methods')
  createPaymentMethod(@Body() dto: CreatePaymentMethodDto) {
    return this.service.createPaymentMethod(dto);
  }

  @Patch('payment-methods/:id')
  updatePaymentMethod(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.service.updatePaymentMethod(id, dto);
  }

  @Delete('payment-methods/:id')
  deletePaymentMethod(@Param('id') id: string) {
    return this.service.deletePaymentMethod(id);
  }

  // Streams the QR back through the API — mismo motivo que payment-requests/:id/proof: la URL
  // de MinIO no es alcanzable desde el navegador.
  @Get('payment-methods/:id/qr')
  async paymentMethodQr(@Param('id') id: string, @Res() res: Response) {
    const objectName = await this.service.getPaymentMethodQrObjectName(id);
    const stream = await this.storage.getObjectStream(objectName);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  // Sube el QR del método de pago — mismo patrón que QuickRepliesController#uploadMedia:
  // devuelve la URL interna de MinIO, que el frontend guarda como `qrImageUrl` del método.
  @Post('payment-methods/media')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PROOF_BYTES } }))
  async uploadPaymentMethodMedia(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const { internalUrl } = await this.storage.uploadBuffer(file.buffer, file.mimetype, extname(file.originalname).replace('.', ''));
    return { url: internalUrl };
  }

  // --- Solicitudes de pago manual ---

  @Get('payment-requests')
  paymentRequests(@Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.service.listPaymentRequests(status);
  }

  // Streams the payment proof back through the API (auth'd, SUPERADMIN only) instead of
  // exposing MinIO's internal URL — same proxy pattern as quick-replies.controller.ts#file.
  @Get('payment-requests/:id/proof')
  async paymentRequestProof(@Param('id') id: string, @Res() res: Response) {
    const request = await this.service.getPaymentRequestProof(id);
    const objectName = request.proofUrl.split('/').pop() as string;
    res.setHeader('Content-Type', request.proofMimeType || 'application/octet-stream');
    const stream = await this.storage.getObjectStream(objectName);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  @Post('payment-requests/:id/approve')
  approvePaymentRequest(@CurrentUser() user: JwtUser, @Param('id') id: string, @Req() req: Request) {
    return this.service.approvePaymentRequest(user.sub, id, req.ip, String(req.headers['user-agent'] || ''));
  }

  @Post('payment-requests/:id/reject')
  rejectPaymentRequest(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: RejectPaymentRequestDto, @Req() req: Request) {
    return this.service.rejectPaymentRequest(user.sub, id, dto.note, req.ip, String(req.headers['user-agent'] || ''));
  }
}
