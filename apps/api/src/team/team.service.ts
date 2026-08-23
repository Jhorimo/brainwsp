import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers(companyId: string) {
    return this.prisma.user.findMany({
      // Platform staff seeded into this company (SUPERADMIN) aren't part of anyone's
      // tenant team roster — keep them out of the company's own "Equipo y agentes" list.
      where: { companyId, role: { not: UserRole.SUPERADMIN } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        allowedModules: true,
        lastLoginAt: true,
        createdAt: true,
        departments: {
          select: { department: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  private async assertDepartmentsBelongToCompany(companyId: string, departmentIds: string[]) {
    if (!departmentIds.length) return;
    const count = await this.prisma.department.count({ where: { id: { in: departmentIds }, companyId } });
    if (count !== new Set(departmentIds).size) throw new BadRequestException('Uno o más departamentos no pertenecen a la empresa');
  }

  async createUser(companyId: string, input: { name: string; email: string; password: string; role?: UserRole; departmentIds?: string[]; allowedModules?: string[] }) {
    // SUPERADMIN is a platform-staff role, not a tenant one — it must only ever be
    // granted by seeding/direct DB access, never through a company's own team management,
    // or any OWNER could self-promote a teammate to cross-tenant access.
    if (input.role === UserRole.SUPERADMIN) throw new BadRequestException('Rol no permitido');

    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('Ya existe un usuario con ese correo');

    const departmentIds = [...new Set(input.departmentIds ?? [])];
    await this.assertDepartmentsBelongToCompany(companyId, departmentIds);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          companyId,
          name: input.name.trim(),
          email,
          passwordHash: await bcrypt.hash(input.password, 12),
          role: input.role || UserRole.AGENT,
          allowedModules: input.allowedModules ?? [],
        },
        select: { id: true, name: true, email: true, role: true, active: true, allowedModules: true, createdAt: true },
      });
      if (departmentIds.length) {
        await tx.departmentUser.createMany({ data: departmentIds.map((departmentId) => ({ departmentId, userId: created.id })) });
      }
      return created;
    });
    return user;
  }

  async updateUser(companyId: string, userId: string, input: { name?: string; role?: UserRole; active?: boolean; password?: string; departmentIds?: string[]; allowedModules?: string[] }) {
    if (input.role === UserRole.SUPERADMIN) throw new BadRequestException('Rol no permitido');
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.role === UserRole.SUPERADMIN) throw new BadRequestException('No puedes modificar este usuario desde aquí');

    const departmentIds = input.departmentIds !== undefined ? [...new Set(input.departmentIds)] : undefined;
    if (departmentIds !== undefined) await this.assertDepartmentsBelongToCompany(companyId, departmentIds);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}),
          ...(input.allowedModules !== undefined ? { allowedModules: input.allowedModules } : {}),
        },
        select: { id: true, name: true, email: true, role: true, active: true, allowedModules: true, lastLoginAt: true, createdAt: true },
      });
      if (departmentIds !== undefined) {
        await tx.departmentUser.deleteMany({ where: { userId } });
        if (departmentIds.length) await tx.departmentUser.createMany({ data: departmentIds.map((departmentId) => ({ departmentId, userId })) });
      }
      return updated;
    });
  }

  listDepartments(companyId: string) {
    return this.prisma.department.findMany({
      where: { companyId },
      include: {
        users: {
          include: { user: { select: { id: true, name: true, email: true, role: true, active: true } } },
        },
        _count: { select: { conversations: true } },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  createDepartment(companyId: string, input: { name: string; description?: string }) {
    return this.prisma.department.create({
      data: { companyId, name: input.name.trim(), description: input.description?.trim() || null },
    }).catch((error: unknown) => {
      if (String(error).includes('Unique constraint')) throw new BadRequestException('Ya existe un departamento con ese nombre');
      throw error;
    });
  }

  async updateDepartment(companyId: string, departmentId: string, input: { name?: string; description?: string; active?: boolean }) {
    const department = await this.prisma.department.findFirst({ where: { id: departmentId, companyId } });
    if (!department) throw new NotFoundException('Departamento no encontrado');
    return this.prisma.department.update({
      where: { id: departmentId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
  }

  async setDepartmentMembers(companyId: string, departmentId: string, userIds: string[]) {
    const department = await this.prisma.department.findFirst({ where: { id: departmentId, companyId } });
    if (!department) throw new NotFoundException('Departamento no encontrado');

    if (userIds.length) {
      const users = await this.prisma.user.count({ where: { id: { in: userIds }, companyId, active: true } });
      if (users !== new Set(userIds).size) throw new BadRequestException('Uno o más usuarios no pertenecen a la empresa o están inactivos');
    }

    await this.prisma.$transaction([
      this.prisma.departmentUser.deleteMany({ where: { departmentId } }),
      ...(userIds.length
        ? [this.prisma.departmentUser.createMany({ data: [...new Set(userIds)].map((userId) => ({ departmentId, userId })) })]
        : []),
    ]);

    return this.prisma.department.findUnique({
      where: { id: departmentId },
      include: { users: { include: { user: { select: { id: true, name: true, email: true, role: true, active: true } } } } },
    });
  }

  listProjects(companyId: string) {
    return this.prisma.project.findMany({
      where: { companyId },
      include: { _count: { select: { conversations: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  createProject(companyId: string, input: { name: string; description?: string }) {
    return this.prisma.project.create({
      data: { companyId, name: input.name.trim(), description: input.description?.trim() || null },
    }).catch((error: unknown) => {
      if (String(error).includes('Unique constraint')) throw new BadRequestException('Ya existe un proyecto con ese nombre');
      throw error;
    });
  }

  async updateProject(companyId: string, projectId: string, input: { name?: string; description?: string; active?: boolean }) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
  }

  async listStages(companyId: string, departmentId: string) {
    const department = await this.prisma.department.findFirst({ where: { id: departmentId, companyId } });
    if (!department) throw new NotFoundException('Departamento no encontrado');
    return this.prisma.pipelineStage.findMany({ where: { companyId, departmentId }, orderBy: { createdAt: 'asc' } });
  }

  async createStage(companyId: string, departmentId: string, input: { name: string; color?: string }) {
    const department = await this.prisma.department.findFirst({ where: { id: departmentId, companyId } });
    if (!department) throw new NotFoundException('Departamento no encontrado');
    return this.prisma.pipelineStage.create({
      data: { companyId, departmentId, name: input.name.trim(), color: input.color || undefined },
    }).catch((error: unknown) => {
      if (String(error).includes('Unique constraint')) throw new BadRequestException('Ya existe una etapa con ese nombre en este departamento');
      throw error;
    });
  }

  async deleteStage(companyId: string, id: string) {
    const stage = await this.prisma.pipelineStage.findFirst({ where: { id, companyId } });
    if (!stage) throw new NotFoundException('Etapa no encontrada');
    await this.prisma.pipelineStage.delete({ where: { id } });
    return { success: true };
  }

  listTags(companyId: string) {
    return this.prisma.tag.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  createTag(companyId: string, input: { name: string; color?: string }) {
    return this.prisma.tag.create({
      data: { companyId, name: input.name.trim(), color: input.color || undefined },
    }).catch((error: unknown) => {
      if (String(error).includes('Unique constraint')) throw new BadRequestException('Ya existe una etiqueta con ese nombre');
      throw error;
    });
  }

  async deleteTag(companyId: string, tagId: string) {
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, companyId } });
    if (!tag) throw new NotFoundException('Etiqueta no encontrada');
    await this.prisma.tag.delete({ where: { id: tagId } });
    return { success: true };
  }

  async getAiSettings(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { aiSystemPrompt: true } });
    return { aiSystemPrompt: company?.aiSystemPrompt || '' };
  }

  async updateAiSettings(companyId: string, input: { aiSystemPrompt?: string }) {
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: { aiSystemPrompt: input.aiSystemPrompt?.trim() || null },
      select: { aiSystemPrompt: true },
    });
    return { aiSystemPrompt: company.aiSystemPrompt || '' };
  }

  listKnowledge(companyId: string) {
    return this.prisma.knowledgeEntry.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }

  createKnowledge(companyId: string, input: { title: string; content: string }) {
    return this.prisma.knowledgeEntry.create({
      data: { companyId, title: input.title.trim(), content: input.content.trim() },
    });
  }

  async updateKnowledge(companyId: string, id: string, input: { title?: string; content?: string }) {
    const entry = await this.prisma.knowledgeEntry.findFirst({ where: { id, companyId } });
    if (!entry) throw new NotFoundException('Entrada no encontrada');
    return this.prisma.knowledgeEntry.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.content !== undefined ? { content: input.content.trim() } : {}),
      },
    });
  }

  async deleteKnowledge(companyId: string, id: string) {
    const entry = await this.prisma.knowledgeEntry.findFirst({ where: { id, companyId } });
    if (!entry) throw new NotFoundException('Entrada no encontrada');
    await this.prisma.knowledgeEntry.delete({ where: { id } });
    return { success: true };
  }
}
