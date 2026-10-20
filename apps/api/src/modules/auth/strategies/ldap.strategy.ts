import { Injectable, NotImplementedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AuthStrategy } from './auth-strategy.interface';

/**
 * مكان LdapStrategy — غير مفعّل في المرحلة 1 (PLAN: LDAP مؤجّل).
 * عند التفعيل: اربط بـ Active Directory، ثم اعثر على المستخدم محليًا بـ employeeNo/email
 * (authSource = ldap) وأعده — بقية النظام (RBAC، التدقيق) لا يتغيّر.
 */
@Injectable()
export class LdapStrategy implements AuthStrategy {
  readonly name = 'ldap' as const;
  readonly supportsPasswordChange = false;

  async validate(_identifier: string, _password: string): Promise<User | null> {
    throw new NotImplementedException('LDAP غير مفعّل بعد — AUTH_SOURCE=local في المرحلة 1');
  }
}
