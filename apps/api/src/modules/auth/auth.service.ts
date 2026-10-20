import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { LOCKOUT_POLICY, PASSWORD_POLICY } from '@task/shared';
import type { LoginResponse, SessionUser } from '@task/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { AUTH_STRATEGY, AuthStrategy } from './strategies/auth-strategy.interface';
import { hashPassword, verifyPassword } from './strategies/local.strategy';
import { assertPasswordPolicy } from './password-policy';
import { ttlToSeconds, type AppConfig } from '../../config/config';

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly cfg: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    config: ConfigService,
    @Inject(AUTH_STRATEGY) private readonly strategy: AuthStrategy,
  ) {
    this.cfg = config.get<AppConfig>('app')!;
  }

  // ───────── الدخول ─────────
  async login(identifier: string, password: string, meta: RequestMeta): Promise<LoginResponse> {
    const id = identifier.trim();
    // الحساب المقفل يُرفض قبل التحقق من كلمة المرور (لا نُطيل نافذة التخمين)
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ employeeNo: id }, { email: id.toLowerCase() }] },
      select: { id: true, lockedUntil: true, isActive: true, failedLogins: true },
    });
    if (existing?.lockedUntil && existing.lockedUntil > new Date()) {
      await this.audit.log({ userId: existing.id, action: 'auth.login.locked', entity: 'User', entityId: existing.id, ...meta });
      const mins = Math.ceil((existing.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`الحساب مقفل مؤقتًا — حاول بعد ${mins} دقيقة`);
    }

    const user = await this.strategy.validate(id, password);
    if (!user || !user.isActive) {
      if (existing) await this.registerFailure(existing.id, existing.failedLogins, meta);
      else await this.audit.log({ action: 'auth.login.failed', entity: 'User', meta: { identifier: id }, ...meta });
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    const tokens = await this.issueTokens(user, meta);
    await this.audit.log({ userId: user.id, action: 'auth.login.success', entity: 'User', entityId: user.id, ...meta });
    return { ...tokens, user: this.users.toSession(user) };
  }

  private async registerFailure(userId: string, failed: number, meta: RequestMeta) {
    const attempts = failed + 1;
    const lock = attempts >= LOCKOUT_POLICY.maxFailedLogins;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLogins: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCKOUT_POLICY.lockMinutes * 60000) : null,
      },
    });
    await this.audit.log({
      userId,
      action: lock ? 'auth.account.locked' : 'auth.login.failed',
      entity: 'User',
      entityId: userId,
      meta: { attempt: attempts, max: LOCKOUT_POLICY.maxFailedLogins },
      ...meta,
    });
  }

  // ───────── الرموز ─────────
  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueTokens(user: User, meta: RequestMeta): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, typ: 'access' },
      { secret: this.cfg.jwt.accessSecret, expiresIn: this.cfg.jwt.accessTtl },
    );
    // رمز التحديث: JWT بسرّ مستقل + jti عشوائي، ونخزّن تجزئته فقط
    const jti = randomBytes(32).toString('hex');
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti, typ: 'refresh' },
      { secret: this.cfg.jwt.refreshSecret, expiresIn: this.cfg.jwt.refreshTtl },
    );
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ttlToSeconds(this.cfg.jwt.refreshTtl) * 1000),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    return { accessToken, refreshToken };
  }

  /** تدوير رمز التحديث: القديم يُبطَل، ويُصدر زوج جديد. إعادة استخدام رمز مُبطَل ⇒ إبطال كل جلسات المستخدم. */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<LoginResponse> {
    let payload: { sub: string; typ: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: this.cfg.jwt.refreshSecret });
    } catch {
      throw new UnauthorizedException('رمز التحديث غير صالح أو منتهٍ');
    }
    if (payload.typ !== 'refresh') throw new UnauthorizedException('رمز غير صالح');

    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashToken(refreshToken) } });
    if (!stored || stored.expiresAt < new Date()) throw new UnauthorizedException('رمز التحديث غير صالح أو منتهٍ');
    if (stored.revokedAt) {
      // رمز مُبطَل أُعيد استخدامه: احتمال سرقة — أغلق كل الجلسات
      await this.revokeAll(stored.userId);
      await this.audit.log({ userId: stored.userId, action: 'auth.refresh.reuse_detected', entity: 'User', entityId: stored.userId, ...meta });
      throw new UnauthorizedException('أُبطلت الجلسات — سجّل الدخول من جديد');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('الحساب غير متاح');

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const tokens = await this.issueTokens(user, meta);
    return { ...tokens, user: this.users.toSession(user) };
  }

  async logout(user: SessionUser, refreshToken: string | undefined, meta: RequestMeta): Promise<{ ok: true }> {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: user.id, tokenHash: this.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.revokeAll(user.id);
    }
    await this.audit.log({ userId: user.id, action: 'auth.logout', entity: 'User', entityId: user.id, ...meta });
    return { ok: true };
  }

  async revokeAll(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  // ───────── كلمة المرور ─────────
  async changePassword(user: SessionUser, currentPassword: string, newPassword: string, meta: RequestMeta): Promise<{ ok: true }> {
    if (!this.strategy.supportsPasswordChange || user.authSource !== 'local') {
      throw new BadRequestException('كلمة المرور تُدار من مصدر الهوية الخارجي');
    }
    const full = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!full?.passwordHash || !(await verifyPassword(full.passwordHash, currentPassword))) {
      throw new UnauthorizedException('كلمة المرور الحالية غير صحيحة');
    }
    await this.setPassword(user.id, newPassword);
    await this.revokeAll(user.id); // تغيير كلمة المرور يُنهي كل الجلسات الأخرى
    await this.audit.log({ userId: user.id, action: 'auth.password.changed', entity: 'User', entityId: user.id, ...meta });
    return { ok: true };
  }

  /** يطبّق السياسة ومنع إعادة الاستخدام ثم يخزّن التجزئة ويحفظ السجل التاريخي */
  async setPassword(userId: string, newPassword: string): Promise<void> {
    assertPasswordPolicy(newPassword);
    const history = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PASSWORD_POLICY.historySize,
    });
    const current = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    const hashes = [current?.passwordHash, ...history.map((h) => h.hash)].filter((h): h is string => !!h);
    for (const h of hashes) {
      if (await verifyPassword(h, newPassword)) {
        throw new BadRequestException(`لا يمكن إعادة استخدام آخر ${PASSWORD_POLICY.historySize} كلمات مرور`);
      }
    }
    const hash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash, passwordChangedAt: new Date() } }),
      ...(current?.passwordHash ? [this.prisma.passwordHistory.create({ data: { userId, hash: current.passwordHash } })] : []),
    ]);
  }
}
