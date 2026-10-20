import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

/** كتابة سجل التدقيق — لا تُفشل الطلب الأصلي أبدًا إن تعذّر التسجيل */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          meta: entry.meta ?? undefined,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent?.slice(0, 300) ?? null,
        },
      });
    } catch (e) {
      this.logger.error(`تعذّر تسجيل التدقيق (${entry.action}): ${(e as Error).message}`);
    }
  }

  list(params: { skip?: number; take?: number; userId?: string; entity?: string; action?: string }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (params.userId) where.userId = params.userId;
    if (params.entity) where.entity = params.entity;
    if (params.action) where.action = { startsWith: params.action };
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: params.skip ?? 0,
      take: Math.min(params.take ?? 50, 200),
      include: { user: { select: { id: true, name: true, employeeNo: true } } },
    });
  }
}
