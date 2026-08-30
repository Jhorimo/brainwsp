import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { extname } from 'path';
import { sortPlansByPrice } from '../common/utils/plan-price';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listPlans() {
    const plans = await this.prisma.plan.findMany({ where: { active: true } });
    return sortPlansByPrice(plans);
  }

  listPaymentMethods() {
    return this.prisma.platformPaymentMethod.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  async getPaymentMethodQrObjectName(id: string) {
    const method = await this.prisma.platformPaymentMethod.findFirst({ where: { id, active: true }, select: { qrImageUrl: true } });
    if (!method?.qrImageUrl) throw new NotFoundException('Este método de pago no tiene QR');
    return method.qrImageUrl.split('/').pop() as string;
  }

  listPaymentRequests(companyId: string) {
    return this.prisma.paymentRequest.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { plan: { select: { id: true, name: true } }, paymentMethod: { select: { id: true, label: true } } },
    });
  }

  async createPaymentRequest(companyId: string, input: { planId?: string; paymentMethodId?: string; whatsappPhone?: string; file?: Express.Multer.File }) {
    if (!input.planId) throw new BadRequestException('Selecciona un plan');
    if (!input.paymentMethodId) throw new BadRequestException('Selecciona un método de pago');
    if (!input.whatsappPhone?.trim()) throw new BadRequestException('Ingresa tu número de WhatsApp');
    if (!input.file) throw new BadRequestException('Sube el comprobante de tu pago');

    const [plan, method] = await Promise.all([
      this.prisma.plan.findFirst({ where: { id: input.planId, active: true } }),
      this.prisma.platformPaymentMethod.findFirst({ where: { id: input.paymentMethodId, active: true } }),
    ]);
    if (!plan) throw new BadRequestException('El plan seleccionado no existe o ya no está disponible');
    if (!method) throw new BadRequestException('El método de pago seleccionado no existe o ya no está disponible');

    const { internalUrl } = await this.storage.uploadBuffer(input.file.buffer, input.file.mimetype, extname(input.file.originalname).replace('.', ''));

    return this.prisma.paymentRequest.create({
      data: {
        companyId,
        planId: plan.id,
        paymentMethodId: method.id,
        whatsappPhone: input.whatsappPhone.trim(),
        proofUrl: internalUrl,
        proofMimeType: input.file.mimetype,
      },
    });
  }
}
