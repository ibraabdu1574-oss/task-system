'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LOCKOUT_POLICY } from '@task/shared';
import { ApiError, loadSession, login } from '@/lib/api';

export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // جلسة قائمة ⇒ لا حاجة للدخول مجددًا
  useEffect(() => {
    if (loadSession()) router.replace('/dashboard');
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الاتصال بالخادم');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid w-[min(100%,400px)] gap-3.5 rounded-[14px] border border-line bg-surface p-7">
      <div className="flex items-center gap-2.5 text-lg font-bold text-accent">
        <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-accent font-bold text-accent-ink">م</span>
        نظام إدارة المهام
      </div>
      <p className="tiny">بيئة التطوير · بيانات تجريبية</p>
      <div className="field">
        <label htmlFor="u">الرقم الوظيفي أو البريد</label>
        <input id="u" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="p">كلمة المرور</label>
        <input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </div>
      {error && <p role="alert" className="rounded-lg px-3 py-2 text-[13px]" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>{error}</p>}
      <button className="btn primary lg" type="submit" disabled={busy}>{busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}</button>
      <p className="tiny">بعد {LOCKOUT_POLICY.maxFailedLogins} محاولات فاشلة يُقفل الحساب {LOCKOUT_POLICY.lockMinutes} دقيقة.</p>
    </form>
  );
}
