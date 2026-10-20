import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthStrategy } from './auth-strategy.interface';

/** معاملات argon2id — متوازنة لخادم واحد يخدم ~150 مستخدمًا */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (plain: string) => argon2.hash(plain, ARGON2_OPTIONS);
export const verifyPassword = (hash: string, plain: string) => argon2.verify(hash, plain).catch(() => false);

/** تجزئة وهمية تُقارَن عند غياب المستخدم لتوحيد زمن الاستجابة (ضد تعداد الحسابات) */
let dummyHash: string | null = null;
async function getDummyHash() {
  if (!dummyHash) dummyHash = await hashPassword('dummy-password-for-timing');
  return dummyHash;
}

@Injectable()
export class LocalStrategy implements AuthStrategy {
  readonly name = 'local' as const;
  readonly supportsPasswordChange = true;

  constructor(private readonly prisma: PrismaService) {}

  async validate(identifier: string, password: string): Promise<User | null> {
    const id = identifier.trim();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ employeeNo: id }, { email: id.toLowerCase() }], authSource: 'local' },
    });
    if (!user?.passwordHash) {
      await verifyPassword(await getDummyHash(), password);
      return null;
    }
    const ok = await verifyPassword(user.passwordHash, password);
    return ok ? user : null;
  }
}
