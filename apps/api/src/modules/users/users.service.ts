import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import type { OrgPosition, SessionUser } from '@task/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../rbac/permission.service';
import { hashPassword } from '../auth/strategies/local.strategy';
import { assertPasswordPolicy } from '../auth/password-policy';
import type { CreateUserDto, ListUsersDto, UpdateUserDto } from './dto/user.dto';

export const SESSION_SELECT = {
  id: true, name: true, employeeNo: true, email: true, role: true, authSource: true,
  generalAdminId: true, administrationId: true, sectionId: true,
  dailyCapacityHours: true, workingDays: true, isActive: true,
} satisfies Prisma.UserSelect;

export const PUBLIC_USER_SELECT = {
  ...SESSION_SELECT,
  lockedUntil: true, failedLogins: true, createdAt: true, updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly perm: PermissionService) {}

  toSession(u: User | SessionUser): SessionUser {
    return {
      id: u.id, name: u.name, employeeNo: u.employeeNo, email: u.email, role: u.role, authSource: u.authSource,
      generalAdminId: u.generalAdminId, administrationId: u.administrationId, sectionId: u.sectionId,
      dailyCapacityHours: u.dailyCapacityHours, workingDays: u.workingDays, isActive: u.isActive,
    };
  }

  async findSession(id: string): Promise<SessionUser | null> {
    return this.prisma.user.findUnique({ where: { id }, select: SESSION_SELECT });
  }

  positionOf(u: Pick<User, 'id' | 'generalAdminId' | 'administrationId' | 'sectionId'>): OrgPosition {
    return { userId: u.id, generalAdminId: u.generalAdminId, administrationId: u.administrationId, sectionId: u.sectionId };
  }

  async list(actor: SessionUser, q: ListUsersDto) {
    const where: Prisma.UserWhereInput = { ...this.perm.scopeWhere(actor) };
    if (q.generalAdminId) where.generalAdminId = q.generalAdminId;
    if (q.administrationId) where.administrationId = q.administrationId;
    if (q.sectionId) where.sectionId = q.sectionId;
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { employeeNo: { contains: q.q } }, { email: { contains: q.q, mode: 'insensitive' } }];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: PUBLIC_USER_SELECT, orderBy: [{ name: 'asc' }], skip: q.skip ?? 0, take: Math.min(q.take ?? 50, 200) }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async get(actor: SessionUser, id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_USER_SELECT });
    if (!u) throw new NotFoundException('المستخدم غير موجود');
    this.perm.assert(actor, 'users.read', this.positionOf(u));
    return u;
  }

  /** يتحقق أن الموقع (إدارة عامة/إدارة/قسم) متّسق هرميًا ويُكمل الحقول العليا تلقائيًا */
  async normalizePosition(pos: { generalAdminId?: string | null; administrationId?: string | null; sectionId?: string | null }) {
    let { generalAdminId = null, administrationId = null, sectionId = null } = pos;
    if (sectionId) {
      const s = await this.prisma.section.findUnique({ where: { id: sectionId }, include: { administration: true } });
      if (!s) throw new BadRequestException('القسم غير موجود');
      if (administrationId && administrationId !== s.administrationId) throw new BadRequestException('القسم لا يتبع هذه الإدارة');
      administrationId = s.administrationId;
      generalAdminId = s.administration.generalAdminId;
    } else if (administrationId) {
      const a = await this.prisma.administration.findUnique({ where: { id: administrationId } });
      if (!a) throw new BadRequestException('الإدارة غير موجودة');
      if (generalAdminId && generalAdminId !== a.generalAdminId) throw new BadRequestException('الإدارة لا تتبع هذه الإدارة العامة');
      generalAdminId = a.generalAdminId;
    } else if (generalAdminId) {
      const g = await this.prisma.generalAdministration.findUnique({ where: { id: generalAdminId } });
      if (!g) throw new BadRequestException('الإدارة العامة غير موجودة');
    }
    return { generalAdminId, administrationId, sectionId };
  }

  async create(actor: SessionUser, dto: CreateUserDto) {
    const pos = await this.normalizePosition(dto);
    // الفاعل لا ينشئ مستخدمًا خارج نطاقه، ولا بدور أعلى من دوره
    this.perm.assert(actor, 'users.manage', { ...pos, userId: 'new' }, 'user');
    this.assertRoleNotAbove(actor, dto.role);

    let passwordHash: string | null = null;
    if (dto.password) {
      assertPasswordPolicy(dto.password);
      passwordHash = await hashPassword(dto.password);
    }
    try {
      return await this.prisma.user.create({
        data: {
          name: dto.name.trim(), employeeNo: dto.employeeNo, email: dto.email.toLowerCase(), role: dto.role,
          passwordHash, ...pos,
          dailyCapacityHours: dto.dailyCapacityHours ?? 6,
          workingDays: dto.workingDays ?? [0, 1, 2, 3, 4],
        },
        select: PUBLIC_USER_SELECT,
      });
    } catch (e) {
      this.rethrowUnique(e);
    }
  }

  async update(actor: SessionUser, id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('المستخدم غير موجود');
    this.perm.assert(actor, 'users.manage', this.positionOf(existing), 'user');
    if (dto.role) this.assertRoleNotAbove(actor, dto.role);
    if (existing.id === actor.id && dto.isActive === false) throw new BadRequestException('لا يمكنك تعطيل حسابك');

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.employeeNo !== undefined) data.employeeNo = dto.employeeNo;
    if (dto.email !== undefined) data.email = dto.email.toLowerCase();
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.dailyCapacityHours !== undefined) data.dailyCapacityHours = dto.dailyCapacityHours;
    if (dto.workingDays !== undefined) data.workingDays = dto.workingDays;
    if (dto.generalAdminId !== undefined || dto.administrationId !== undefined || dto.sectionId !== undefined) {
      const pos = await this.normalizePosition({
        generalAdminId: dto.generalAdminId === undefined ? existing.generalAdminId : dto.generalAdminId,
        administrationId: dto.administrationId === undefined ? existing.administrationId : dto.administrationId,
        sectionId: dto.sectionId === undefined ? existing.sectionId : dto.sectionId,
      });
      // الموقع الجديد يجب أن يبقى داخل نطاق الفاعل أيضًا
      this.perm.assert(actor, 'users.manage', { ...pos, userId: id }, 'user');
      Object.assign(data, {
        generalAdmin: pos.generalAdminId ? { connect: { id: pos.generalAdminId } } : { disconnect: true },
        administration: pos.administrationId ? { connect: { id: pos.administrationId } } : { disconnect: true },
        section: pos.sectionId ? { connect: { id: pos.sectionId } } : { disconnect: true },
      });
    }
    if (dto.password) {
      assertPasswordPolicy(dto.password);
      data.passwordHash = await hashPassword(dto.password);
      data.passwordChangedAt = new Date();
      data.failedLogins = 0;
      data.lockedUntil = null;
    }
    try {
      return await this.prisma.user.update({ where: { id }, data, select: PUBLIC_USER_SELECT });
    } catch (e) {
      this.rethrowUnique(e);
    }
  }

  /** فكّ قفل حساب يدويًا */
  async unlock(actor: SessionUser, id: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('المستخدم غير موجود');
    this.perm.assert(actor, 'users.manage', this.positionOf(existing), 'user');
    return this.prisma.user.update({ where: { id }, data: { failedLogins: 0, lockedUntil: null }, select: PUBLIC_USER_SELECT });
  }

  private assertRoleNotAbove(actor: SessionUser, role: string) {
    const rank: Record<string, number> = { ceo: 0, generalAdminManager: 1, adminManager: 2, followUpOfficer: 2, supervisor: 3, employee: 4 };
    if (rank[role] < rank[actor.role]) throw new BadRequestException('لا يمكن منح دور أعلى من دورك');
  }

  private rethrowUnique(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const f = (e.meta?.target as string[] | undefined)?.join(', ');
      throw new ConflictException(`قيمة مكرّرة: ${f ?? 'الرقم الوظيفي أو البريد'}`);
    }
    throw e;
  }
}
