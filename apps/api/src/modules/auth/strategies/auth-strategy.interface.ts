import type { User } from '@prisma/client';

/**
 * واجهة مصدر الهوية. اليوم LocalStrategy فقط؛ لاحقًا LdapStrategy تُفعَّل من AUTH_SOURCE=ldap
 * دون تغيير AuthService أو بقية النظام (PLAN القسم 1).
 */
export interface AuthStrategy {
  readonly name: 'local' | 'ldap';
  /**
   * يتحقق من الهوية ويعيد المستخدم أو null.
   * المستخدم المُعاد يجب أن يكون موجودًا في قاعدة البيانات (ليُحسب نطاقه من الشجرة).
   */
  validate(identifier: string, password: string): Promise<User | null>;
  /** هل يدعم هذا المصدر تغيير كلمة المرور من داخل النظام؟ */
  readonly supportsPasswordChange: boolean;
}

export const AUTH_STRATEGY = Symbol('AUTH_STRATEGY');
