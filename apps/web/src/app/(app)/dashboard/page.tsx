'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ROLE_LABELS, WEEKDAY_LABELS, type OrgTree } from '@task/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const ar = (n: number) => n.toLocaleString('ar-EG');

export default function Dashboard() {
  const { user } = useAuth();
  const [tree, setTree] = useState<OrgTree | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OrgTree>('/org/tree').then(setTree).catch((e: Error) => setError(e.message));
  }, []);

  if (!user) return null;
  const c = tree?.counts;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
        <h1>الرئيسية</h1>
        <span className="text-xs text-ink3">مرحبًا {user.name} — {ROLE_LABELS[user.role]}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <div className="tile"><span className="l">إدارات عامة في نطاقك</span><span className="v">{c ? ar(c.generalAdmins) : '…'}</span></div>
        <div className="tile"><span className="l">إدارات</span><span className="v">{c ? ar(c.administrations) : '…'}</span></div>
        <div className="tile"><span className="l">أقسام</span><span className="v">{c ? ar(c.sections) : '…'}</span></div>
        <div className="tile"><span className="l">موظفون نشطون</span><span className="v">{c ? ar(c.users) : '…'}</span></div>
      </div>
      {error && <p className="note" style={{ color: 'var(--bad)' }}>{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card-s">
          <h2>المرحلة الحالية: الأساس</h2>
          <p className="text-ink2">المصادقة، الهيكل التنظيمي، والصلاحيات الهرمية جاهزة. المهام ولوحة Kanban ومحرك الانحراف تأتي في المراحل التالية.</p>
          <Link href="/org" className="btn justify-self-start">عرض الهيكل التنظيمي</Link>
        </div>
        <div className="card-s">
          <h3>سعتك (أساس محرك الانحراف)</h3>
          <dl className="m-0 grid gap-2.5">
            <div className="grid gap-0.5"><dt className="text-xs text-ink3">ساعات العمل المنتجة يوميًا</dt><dd className="m-0 font-medium">{ar(user.dailyCapacityHours)} ساعات</dd></div>
            <div className="grid gap-0.5"><dt className="text-xs text-ink3">أيام العمل</dt><dd className="m-0 font-medium">{user.workingDays.map((d) => WEEKDAY_LABELS[d]).join('، ')}</dd></div>
            <div className="grid gap-0.5"><dt className="text-xs text-ink3">مصدر الهوية</dt><dd className="m-0 font-medium">{user.authSource === 'local' ? 'محلي' : 'LDAP'}</dd></div>
          </dl>
        </div>
      </div>
    </>
  );
}
