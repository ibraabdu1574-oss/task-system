/**
 * قراءة الإعدادات من البيئة مع تحقق صارم عند الإقلاع.
 * لا قيم سرّية افتراضية: غياب سرّ = فشل واضح، لا تشغيل بسرّ ضعيف.
 */
export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  publicUrl: string;
  databaseUrl: string;
  redisUrl: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string; // مثل 15m
    refreshTtl: string; // مثل 7d
  };
  authSource: 'local' | 'ldap';
  swaggerEnabled: boolean;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`متغيّر البيئة ${name} غير موجود — شغّل: task env`);
  }
  return v;
}

export function loadConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV as AppConfig['nodeEnv']) || 'development';
  const accessSecret = required('JWT_ACCESS_SECRET');
  const refreshSecret = required('JWT_REFRESH_SECRET');
  if (accessSecret.length < 32 || refreshSecret.length < 32) {
    throw new Error('أسرار JWT قصيرة جدًا (≥ 32 حرفًا) — أعد توليدها: task env');
  }
  if (accessSecret === refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET و JWT_REFRESH_SECRET يجب أن يختلفا');
  }
  return {
    nodeEnv,
    port: Number(process.env.PORT || 3001),
    publicUrl: process.env.PUBLIC_URL || 'https://iat.sa',
    databaseUrl: required('DATABASE_URL'),
    redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
    jwt: {
      accessSecret,
      refreshSecret,
      accessTtl: process.env.JWT_ACCESS_TTL || '15m',
      refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
    },
    authSource: (process.env.AUTH_SOURCE as AppConfig['authSource']) || 'local',
    swaggerEnabled: nodeEnv !== 'production',
  };
}

/** يحوّل مدة مثل "15m" أو "7d" إلى ثوانٍ */
export function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
  if (!m) throw new Error(`صيغة مدة غير صالحة: ${ttl}`);
  const n = Number(m[1]);
  return { s: n, m: n * 60, h: n * 3600, d: n * 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
}
