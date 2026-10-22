'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { FormEvent, ReactNode } from 'react';
import { ROLE_LABELS } from '@task/shared';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

const NAV: { href: string; label: string; icon: string; soon?: boolean }[] = [
  { href: '/dashboard', label: 'الرئيسية', icon: '▣' },
  { href: '/tasks', label: 'المهام', icon: '☰' },
  { href: '/kanban', label: 'لوحة Kanban', icon: '▥', soon: true },
  { href: '/calendar', label: 'التقويم', icon: '▦', soon: true },
];
const ADMIN_NAV: { href: string; label: string; icon: string; soon?: boolean }[] = [
  { href: '/org', label: 'الهيكل التنظيمي', icon: '⌂' },
  { href: '/reports', label: 'التقارير', icon: '▤', soon: true },
  { href: '/audit', label: 'سجل التدقيق', icon: '≡', soon: true },
  { href: '/settings', label: 'الإعدادات', icon: '⚙', soon: true },
];

const BRANDS = [
  { id: 'calm', label: 'هادئ' },
  { id: 'gov', label: 'رسمي' },
  { id: 'modern', label: 'عصري' },
] as const;

/** الهيكل العام: شريط جانبي + شريط علوي — بهوية prototype.html */
export function Shell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { brand, toggleTheme, changeBrand } = useTheme();
  const path = usePathname();
  const router = useRouter();

  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = (new FormData(e.currentTarget).get('q') as string).trim();
    router.push(q ? `/tasks?q=${encodeURIComponent(q)}` : '/tasks');
  }

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-ink3">جارٍ التحميل…</div>;
  }

  const roleLine = ROLE_LABELS[user.role];
  const navItem = (n: (typeof NAV)[number]) =>
    n.soon ? (
      <span key={n.href} className="nav opacity-40 cursor-not-allowed" title="مرحلة لاحقة">
        <span className="ic">{n.icon}</span>{n.label}
      </span>
    ) : (
      <Link key={n.href} href={n.href} className={`nav ${path.startsWith(n.href) ? 'active' : ''}`}>
        <span className="ic">{n.icon}</span>{n.label}
      </Link>
    );

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-1.5 bg-side p-3 text-side-ink md:sticky md:top-0 md:h-screen md:overflow-auto">
        <div className="flex items-center gap-2.5 px-2 pb-3.5 pt-1.5 font-bold text-white">
          <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-accent font-bold text-accent-ink">م</span>
          إدارة المهام
        </div>
        {NAV.map(navItem)}
        <div className="px-2.5 pb-0.5 pt-2.5 text-[11px] tracking-wider opacity-55">الإدارة</div>
        {ADMIN_NAV.map(navItem)}
        <div className="mt-auto grid gap-1.5 border-t border-white/10 p-2.5 text-xs">
          <b className="text-[13px] text-white">{user.name}</b>
          <span>{roleLine} · {user.employeeNo}</span>
          <button type="button" onClick={signOut} className="text-start text-inherit underline-offset-2 hover:underline">تسجيل الخروج</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-line bg-surface px-5 py-3">
          <form onSubmit={search} className="contents">
            <input name="q" type="search" placeholder="ابحث في المهام… (عنوان أو #رقم)" aria-label="بحث في المهام" className="w-[min(100%,260px)] rounded-lg border border-line bg-bg px-2.5 py-1.5 text-ink" />
          </form>
          <span className="flex-1" />
          <span className="proto">بيئة التطوير · بيانات تجريبية</span>
          <span className="text-[11px] font-semibold text-ink3">التصميم</span>
          <div className="brandsw" role="group" aria-label="نمط التصميم">
            {BRANDS.map((b) => (
              <button key={b.id} type="button" aria-pressed={brand === b.id} onClick={() => changeBrand(b.id)}>{b.label}</button>
            ))}
          </div>
          <button className="btn" type="button" onClick={toggleTheme}>الوضع الداكن</button>
        </header>
        <main className="grid content-start gap-4 p-5">{children}</main>
        <footer className="mt-auto border-t border-line px-5 py-2.5 text-xs text-ink3">نظام إدارة المهام · المرحلة 2 — المهام</footer>
      </div>
    </div>
  );
}
