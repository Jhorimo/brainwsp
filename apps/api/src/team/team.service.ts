import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers(companyId: string) {
    return this.prisma.user.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        departments: {
          select: { department: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async createUser(companyId: string, input: { name: string; email: string; password: string; role?: UserRole }) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('Ya existe un usuario con ese correo');

    const user = await this.prisma.user.create({
      data: {
        companyId,
        name: input.name.trim(),
        email,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: input.role || UserRole.AGENT,
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    return user;
  }

  async updateUser(companyId: string, userId: string, input: { name?: string; role?: UserRole; active?: boolean; password?: string }) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}),
      },
      select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, createdAt: true },
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
