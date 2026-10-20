import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OrgPosition, OrgTree, OrgTreeUser, SessionUser } from '@task/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../rbac/permission.service';
import type {
  AssignDto, CreateAdministrationDto, CreateGeneralAdminDto, CreateSectionDto, UpdateAdministrationDto, UpdateGeneralAdminDto, UpdateSectionDto,
} from './dto/org.dto';

const USER_BRIEF = { id: true, name: true, employeeNo: true, role: true, isActive: true } satisfies Prisma.UserSelect;

@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService, private readonly perm: PermissionService) {}

  // ───────── مواقع الوحدات في الشجرة ─────────
  private async gaPosition(id: string): Promise<OrgPosition> {
    const g = await this.prisma.generalAdministration.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('الإدارة العامة غير موجودة');
    return { generalAdminId: g.id };
  }
  private async adminPosition(id: string): Promise<OrgPosition> {
    const a = await this.prisma.administration.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('الإدارة غير موجودة');
    return { generalAdminId: a.generalAdminId, administrationId: a.id };
  }
  private async sectionPosition(id: string): Promise<OrgPosition> {
    const s = await this.prisma.section.findUnique({ where: { id }, include: { administration: true } });
    if (!s) throw new NotFoundException('القسم غير موجود');
    return { generalAdminId: s.administration.generalAdminId, administrationId: s.administrationId, sectionId: s.id };
  }

  /** المستخدم المُعيَّن مديرًا/مشرفًا يجب أن يكون نشطًا وداخل نطاق الفاعل */
  private async assertAssignable(actor: SessionUser, userId: string | null | undefined) {
    if (!userId) return;
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !u.isActive) throw new BadRequestException('المستخدم غير موجود أو غير نشط');
    this.perm.assert(actor, 'users.read', { userId: u.id, generalAdminId: u.generalAdminId, administrationId: u.administrationId, sectionId: u.sectionId });
  }

  private rethrowUnique(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') throw new ConflictException('الاسم مستخدم مسبقًا في المستوى نفسه');
      if (e.code === 'P2003') throw new BadRequestException('لا يمكن الحذف — توجد وحدات تابعة. احذفها أو انقلها أولًا');
    }
    throw e;
  }

  // ───────── الإدارات العامة ─────────
  async createGeneralAdmin(actor: SessionUser, dto: CreateGeneralAdminDto) {
    this.perm.assert(actor, 'org.manage', { generalAdminId: 'new' }, 'generalAdmin');
    await this.assertAssignable(actor, dto.managerId);
    try {
      return await this.prisma.generalAdministration.create({ data: { name: dto.name.trim(), managerId: dto.managerId ?? null } });
    } catch (e) { this.rethrowUnique(e); }
  }
  async updateGeneralAdmin(actor: SessionUser, id: string, dto: UpdateGeneralAdminDto) {
    this.perm.assert(actor, 'org.manage', await this.gaPosition(id), 'generalAdmin');
    try {
      return await this.prisma.generalAdministration.update({ where: { id }, data: { ...(dto.name && { name: dto.name.trim() }) } });
    } catch (e) { this.rethrowUnique(e); }
  }
  async deleteGeneralAdmin(actor: SessionUser, id: string) {
    this.perm.assert(actor, 'org.manage', await this.gaPosition(id), 'generalAdmin');
    try {
      await this.prisma.generalAdministration.delete({ where: { id } });
      return { ok: true };
    } catch (e) { this.rethrowUnique(e); }
  }
  async assignGaManager(actor: SessionUser, id: string, dto: AssignDto) {
    this.perm.assert(actor, 'org.manage', await this.gaPosition(id), 'generalAdmin');
    await this.assertAssignable(actor, dto.userId);
    return this.prisma.generalAdministration.update({ where: { id }, data: { managerId: dto.userId ?? null }, include: { manager: { select: USER_BRIEF } } });
  }

  // ───────── الإدارات ─────────
  async createAdministration(actor: SessionUser, dto: CreateAdministrationDto) {
    const parent = await this.gaPosition(dto.generalAdminId);
    this.perm.assert(actor, 'org.manage', { ...parent, administrationId: 'new' }, 'administration');
    await this.assertAssignable(actor, dto.managerId);
    try {
      return await this.prisma.administration.create({ data: { generalAdminId: dto.generalAdminId, name: dto.name.trim(), managerId: dto.managerId ?? null } });
    } catch (e) { this.rethrowUnique(e); }
  }
  async updateAdministration(actor: SessionUser, id: string, dto: UpdateAdministrationDto) {
    this.perm.assert(actor, 'org.manage', await this.adminPosition(id), 'administration');
    try {
      return await this.prisma.administration.update({ where: { id }, data: { ...(dto.name && { name: dto.name.trim() }) } });
    } catch (e) { this.rethrowUnique(e); }
  }
  async deleteAdministration(actor: SessionUser, id: string) {
    this.perm.assert(actor, 'org.manage', await this.adminPosition(id), 'administration');
    try {
      await this.prisma.administration.delete({ where: { id } });
      return { ok: true };
    } catch (e) { this.rethrowUnique(e); }
  }
  async assignAdminManager(actor: SessionUser, id: string, dto: AssignDto) {
    this.perm.assert(actor, 'org.manage', await this.adminPosition(id), 'administration');
    await this.assertAssignable(actor, dto.userId);
    return this.prisma.administration.update({ where: { id }, data: { managerId: dto.userId ?? null }, include: { manager: { select: USER_BRIEF } } });
  }

  // ───────── الأقسام ─────────
  async createSection(actor: SessionUser, dto: CreateSectionDto) {
    const parent = await this.adminPosition(dto.administrationId);
    this.perm.assert(actor, 'org.manage', { ...parent, sectionId: 'new' }, 'section');
    await this.assertAssignable(actor, dto.supervisorId);
    try {
      return await this.prisma.section.create({ data: { administrationId: dto.administrationId, name: dto.name.trim(), supervisorId: dto.supervisorId ?? null } });
    } catch (e) { this.rethrowUnique(e); }
  }
  async updateSection(actor: SessionUser, id: string, dto: UpdateSectionDto) {
    this.perm.assert(actor, 'org.manage', await this.sectionPosition(id), 'section');
    try {
      return await this.prisma.section.update({ where: { id }, data: { ...(dto.name && { name: dto.name.trim() }) } });
    } catch (e) { this.rethrowUnique(e); }
  }
  async deleteSection(actor: SessionUser, id: string) {
    this.perm.assert(actor, 'org.manage', await this.sectionPosition(id), 'section');
    const members = await this.prisma.user.count({ where: { sectionId: id } });
    if (members > 0) throw new BadRequestException(`لا يمكن حذف القسم — فيه ${members} موظفًا. انقلهم أولًا`);
    await this.prisma.section.delete({ where: { id } });
    return { ok: true };
  }
  async assignSupervisor(actor: SessionUser, id: string, dto: AssignDto) {
    this.perm.assert(actor, 'org.manage', await this.sectionPosition(id), 'section');
    await this.assertAssignable(actor, dto.userId);
    return this.prisma.section.update({ where: { id }, data: { supervisorId: dto.userId ?? null }, include: { supervisor: { select: USER_BRIEF } } });
  }

  // ───────── الشجرة ─────────
  /**
   * شجرة الهيكل مقصورة على نطاق الفاعل:
   * الرئيس: الكل · المدير العام: إدارته العامة · مدير الإدارة/مسؤول المتابعة: إدارته ·
   * المشرف: قسمه · الموظف: مسار قسمه ونفسه فقط.
   */
  async tree(actor: SessionUser): Promise<OrgTree> {
    const scope = this.perm.resolveScope(actor);
    const gaWhere: Prisma.GeneralAdministrationWhereInput = {};
    const adminWhere: Prisma.AdministrationWhereInput = {};
    const sectionWhere: Prisma.SectionWhereInput = {};
    const userWhere: Prisma.UserWhereInput = {};
    if (scope.level === 'generalAdmin') gaWhere.id = scope.generalAdminId!;
    if (scope.level === 'administration') { gaWhere.id = scope.generalAdminId ?? undefined; adminWhere.id = scope.administrationId!; }
    if (scope.level === 'section') { gaWhere.id = scope.generalAdminId ?? undefined; adminWhere.id = scope.administrationId ?? undefined; sectionWhere.id = scope.sectionId!; }
    if (scope.level === 'user') {
      gaWhere.id = actor.generalAdminId ?? '-'; adminWhere.id = actor.administrationId ?? '-'; sectionWhere.id = actor.sectionId ?? '-'; userWhere.id = actor.id;
    }

    const gas = await this.prisma.generalAdministration.findMany({
      where: gaWhere,
      orderBy: { name: 'asc' },
      include: {
        manager: { select: USER_BRIEF },
        members: { where: { ...userWhere, administrationId: null }, select: USER_BRIEF, orderBy: { name: 'asc' } },
        administrations: {
          where: adminWhere,
          orderBy: { name: 'asc' },
          include: {
            manager: { select: USER_BRIEF },
            members: { where: { ...userWhere, sectionId: null }, select: USER_BRIEF, orderBy: { name: 'asc' } },
            sections: {
              where: sectionWhere,
              orderBy: { name: 'asc' },
              include: { supervisor: { select: USER_BRIEF }, members: { where: userWhere, select: USER_BRIEF, orderBy: { name: 'asc' } } },
            },
          },
        },
      },
    });
    const followUps = await this.prisma.user.findMany({ where: { role: 'followUpOfficer', isActive: true, ...userWhere }, select: { ...USER_BRIEF, administrationId: true } });
    const unassigned: OrgTreeUser[] = scope.level === 'organization'
      ? await this.prisma.user.findMany({ where: { generalAdminId: null }, select: USER_BRIEF, orderBy: { name: 'asc' } })
      : [];

    const asUser = (u: { id: string; name: string; employeeNo: string; role: string; isActive: boolean } | null): OrgTreeUser | null =>
      u ? { id: u.id, name: u.name, employeeNo: u.employeeNo, role: u.role as OrgTreeUser['role'], isActive: u.isActive } : null;

    const generalAdmins = gas.map((g) => ({
      id: g.id, name: g.name, manager: asUser(g.manager), users: g.members.map((u) => asUser(u)!),
      administrations: g.administrations.map((a) => ({
        id: a.id, name: a.name, manager: asUser(a.manager),
        followUpOfficers: followUps.filter((f) => f.administrationId === a.id).map((f) => asUser(f)!),
        users: a.members.map((u) => asUser(u)!),
        sections: a.sections.map((s) => ({ id: s.id, name: s.name, supervisor: asUser(s.supervisor), users: s.members.map((u) => asUser(u)!) })),
      })),
    }));

    const [gaCount, adminCount, sectionCount, userCount] = await this.prisma.$transaction([
      this.prisma.generalAdministration.count({ where: gaWhere }),
      this.prisma.administration.count({ where: { ...adminWhere, generalAdmin: gaWhere } }),
      this.prisma.section.count({ where: { ...sectionWhere, administration: { ...adminWhere, generalAdmin: gaWhere } } }),
      this.prisma.user.count({ where: { ...this.perm.scopeWhere(actor), isActive: true } }),
    ]);

    return { generalAdmins, unassigned, counts: { generalAdmins: gaCount, administrations: adminCount, sections: sectionCount, users: userCount } };
  }

  async listGeneralAdmins(actor: SessionUser) {
    const scope = this.perm.resolveScope(actor);
    const where: Prisma.GeneralAdministrationWhereInput = scope.level === 'organization' ? {} : { id: actor.generalAdminId ?? '-' };
    return this.prisma.generalAdministration.findMany({ where, orderBy: { name: 'asc' }, include: { manager: { select: USER_BRIEF }, _count: { select: { administrations: true, members: true } } } });
  }
}
