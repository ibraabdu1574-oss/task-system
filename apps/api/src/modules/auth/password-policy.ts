import { BadRequestException } from '@nestjs/common';
import { PASSWORD_POLICY } from '@task/shared';

/** يتحقق من سياسة كلمة المرور ويرمي 400 برسالة عربية تفصيلية */
export function assertPasswordPolicy(password: string): void {
  const errors: string[] = [];
  if (password.length < PASSWORD_POLICY.minLength) errors.push(`${PASSWORD_POLICY.minLength} خانة على الأقل`);
  if (PASSWORD_POLICY.requireUpper && !/[A-Z]/.test(password)) errors.push('حرف كبير');
  if (PASSWORD_POLICY.requireLower && !/[a-z]/.test(password)) errors.push('حرف صغير');
  if (PASSWORD_POLICY.requireDigit && !/\d/.test(password)) errors.push('رقم');
  if (PASSWORD_POLICY.requireSymbol && !/[^A-Za-z0-9]/.test(password)) errors.push('رمز');
  if (errors.length) throw new BadRequestException(`كلمة المرور لا تحقق السياسة: ${errors.join('، ')}`);
}
