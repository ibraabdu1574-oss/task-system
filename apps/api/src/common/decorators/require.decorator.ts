import { SetMetadata } from '@nestjs/common';
import type { Action } from '@task/shared';

export const REQUIRE_KEY = 'requireAction';
/**
 * الإجراء المطلوب للمسار. PermissionsGuard يرفض أي مسار محمي بلا @Require() ولا @Public()
 * — مبدأ أقل صلاحية: المنع ما لم يُسمح صراحةً.
 */
export const Require = (action: Action) => SetMetadata(REQUIRE_KEY, action);
