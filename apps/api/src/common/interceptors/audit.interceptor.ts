import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { Prisma } from '@prisma/client';
import type { SessionUser } from '@task/shared';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';
import { AuditService } from '../../modules/audit/audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE = /password|token|secret|hash/i;

/** يحذف الحقول الحسّاسة من جسم الطلب قبل تخزينه في meta */
function sanitize(body: unknown): Prisma.InputJsonObject | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const out: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? '[محجوب]' : (v as Prisma.InputJsonValue | null);
  }
  return out;
}

/**
 * سجل التدقيق: كل طلب معدِّل (POST/PUT/PATCH/DELETE) ناجح يُسجَّل (من/ماذا/متى/IP).
 * @Audit() يضبط اسم الإجراء والكيان؛ بدونه يُشتق من المسار.
 * مسارات المصادقة تسجّل نفسها بتفصيل أدق داخل AuthService فتُستثنى هنا.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_KEY, context.getHandler());
    const isMutating = MUTATING.has(req.method);
    const isAuth = req.path.includes('/auth/');
    if ((!isMutating && !meta) || isAuth) return next.handle();

    return next.handle().pipe(
      tap((result: unknown) => {
        const idParam = meta?.idParam ?? 'id';
        const paramId = (req.params as Record<string, string>)?.[idParam];
        const resultId = result && typeof result === 'object' ? (result as { id?: string }).id : undefined;
        void this.audit.log({
          userId: req.user?.id ?? null,
          action: meta?.action ?? `${req.method.toLowerCase()} ${req.route?.path ?? req.path}`,
          entity: meta?.entity ?? (req.route?.path ?? req.path).split('/').filter(Boolean).slice(2, 4).join('/'),
          entityId: paramId ?? resultId ?? null,
          meta: sanitize(req.body),
          ip: req.ip ?? null,
          userAgent: req.get('user-agent') ?? null,
        });
      }),
    );
  }
}
