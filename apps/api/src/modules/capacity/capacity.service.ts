import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SessionUser } from '@task/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../rbac/permission.service';
import { UsersService } from '../users/users.service';
import type { CreateHolidayDto, CreateLeaveDto, HolidayQueryDto, LeaveQueryDto, UpdateHolidayDto, UpdateLeaveDto } from './dto/capacity.dto';

/** تاريخ بلا وقت (عمود DATE) */
const asDate = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);

/**
 * وحدة السعة — المرحلة 1: التقاط العطل والإجازات فقط (CRUD بسيط، بلا حساب).
 * محرك الجدولة يُبنى في المرحلة 6 (PLAN القسم 9).
 */
@Injectable()
export class CapacityService {
  constructor(private readonly prisma: PrismaService, private readonly perm: PermissionService, private readonly users: UsersService) {}

  // ───────── العطل الرسمية (عامة للجهة) ─────────
  listHolidays(q: HolidayQueryDto) {
    const where: Prisma.HolidayWhereInput = q.year
      ? { date: { gte: asDate(`${q.year}-01-01`), lte: asDate(`${q.year}-12-31`) } }
      : {};
    return this.prisma.holiday.findMany({ where, orderBy: { date: 'asc' } });
  }
  async createHoliday(dto: CreateHolidayDto) {
    try {
      return await this.prisma.holiday.create({ data: { date: asDate(dto.date), name: dto.name.trim() } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('يوجد عطلة في هذا التاريخ');
      throw e;
    }
  }
  async updateHoliday(id: string, dto: UpdateHolidayDto) {
    await this.getHoliday(id);
    return this.prisma.holiday.update({ where: { id }, data: { ...(dto.date && { date: asDate(dto.date) }), ...(dto.name && { name: dto.name.trim() }) } });
  }
  async deleteHoliday(id: string) {
    await this.getHoliday(id);
    await this.prisma.holiday.delete({ where: { id } });
    return { ok: true };
  }
  private async getHoliday(id: string) {
    const h = await this.prisma.holiday.findUnique({ where: { id } });
    if (!h) throw new NotFoundException('العطلة غير موجودة');
    return h;
  }

  // ───────── الإجازات (ضمن النطاق) ─────────
  async listLeaves(actor: SessionUser, q: LeaveQueryDto) {
    const where: Prisma.LeaveWhereInput = { user: this.perm.scopeWhere(actor) };
    if (q.userId) where.userId = q.userId;
    if (q.from) where.endAt = { gte: asDate(q.from) };
    if (q.to) where.startAt = { lte: asDate(q.to) };
    return this.prisma.leave.findMany({
      where,
      orderBy: { startAt: 'desc' },
      include: { user: { select: { id: true, name: true, employeeNo: true, sectionId: true } } },
    });
  }

  async createLeave(actor: SessionUser, dto: CreateLeaveDto) {
    const userId = dto.userId ?? actor.id;
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException('المستخدم غير موجود');
    this.perm.assert(actor, 'leaves.manage', this.users.positionOf(target), 'user');
    const startAt = asDate(dto.startAt), endAt = asDate(dto.endAt);
    if (endAt < startAt) throw new BadRequestException('تاريخ النهاية قبل البداية');
    const overlap = await this.prisma.leave.findFirst({ where: { userId, startAt: { lte: endAt }, endAt: { gte: startAt } } });
    if (overlap) throw new ConflictException('توجد إجازة متداخلة مع هذه الفترة');
    return this.prisma.leave.create({ data: { userId, startAt, endAt, reason: dto.reason?.trim() || null } });
  }

  async updateLeave(actor: SessionUser, id: string, dto: UpdateLeaveDto) {
    const leave = await this.getLeaveAuthorized(actor, id);
    const startAt = dto.startAt ? asDate(dto.startAt) : leave.startAt;
    const endAt = dto.endAt ? asDate(dto.endAt) : leave.endAt;
    if (endAt < startAt) throw new BadRequestException('تاريخ النهاية قبل البداية');
    const overlap = await this.prisma.leave.findFirst({ where: { id: { not: id }, userId: leave.userId, startAt: { lte: endAt }, endAt: { gte: startAt } } });
    if (overlap) throw new ConflictException('توجد إجازة متداخلة مع هذه الفترة');
    return this.prisma.leave.update({ where: { id }, data: { startAt, endAt, ...(dto.reason !== undefined && { reason: dto.reason.trim() || null }) } });
  }

  async deleteLeave(actor: SessionUser, id: string) {
    await this.getLeaveAuthorized(actor, id);
    await this.prisma.leave.delete({ where: { id } });
    return { ok: true };
  }

  private async getLeaveAuthorized(actor: SessionUser, id: string) {
    const leave = await this.prisma.leave.findUnique({ where: { id }, include: { user: true } });
    if (!leave) throw new NotFoundException('الإجازة غير موجودة');
    this.perm.assert(actor, 'leaves.manage', this.users.positionOf(leave.user), 'user');
    return leave;
  }
}
