import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SessionUser } from '@task/shared';

/** المستخدم الحالي كما وضعه JwtStrategy في الطلب */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  return ctx.switchToHttp().getRequest().user as SessionUser;
});
