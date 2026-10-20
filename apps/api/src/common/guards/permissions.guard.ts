import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Action, SessionUser } from '@task/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REQUIRE_KEY } from '../decorators/require.decorator';
import { PermissionService } from '../../modules/rbac/permission.service';

/**
 * الفحص الخشن على كل طلب: هل دور الفاعل يسمح بالإجراء المعلن على المسار؟
 * الفحص الموضعي (هل المورد داخل نطاقه؟) تجريه الخدمة بـ PermissionService.assert()
 * لأنه يحتاج موقع المورد من قاعدة البيانات.
 * مسار محمي بلا @Require ⇒ مرفوض (أقل صلاحية).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector, private readonly perm: PermissionService) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const action = this.reflector.getAllAndOverride<Action | undefined>(REQUIRE_KEY, targets);
    const req = context.switchToHttp().getRequest();
    const user = req.user as SessionUser | undefined;
    if (!user) throw new ForbiddenException('يلزم تسجيل الدخول');

    if (!action) {
      // مسار "ذاتي" (مثل /auth/me) يُعلَّم بـ @Require('self') ضمنيًا عبر عدم الحاجة لإجراء؛
      // لتفادي ثغرة النسيان نرفض ما لم يُعلَّم المسار صراحةً.
      this.logger.warn(`مسار بلا @Require: ${req.method} ${req.url}`);
      throw new ForbiddenException('المسار غير معلن الصلاحية');
    }
    if (!this.perm.can(user, action)) throw new ForbiddenException('ليست لديك صلاحية لهذا الإجراء');
    return true;
  }
}
