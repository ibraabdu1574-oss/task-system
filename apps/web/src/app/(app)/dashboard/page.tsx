'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ROLE_LABELS, WEEKDAY_LABELS, type OrgTree, type TaskListResponse, type TaskStats } from '@task/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ar, assigneesLine, CategoryPill, fmtDay, isOverdue, StatePill } from '@/components/tasks/bits';

export default function Dashboard() {
  const { user } = useAuth();
  const [tree, setTree] = useState<OrgTree | null>(null);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [recent, setRecent] = useState<TaskListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OrgTree>('/org/tree').then(setTree).catch((e: Error) => setError(e.message));
    api<TaskStats>('/tasks/stats').then(setStats).catch((e: Error) => setError(e.message));
    api<TaskListResponse>('/tasks?take=6').then(setRecent).catch(() => undefined);
  }, []);

  if (!user) return null;
  const c = tree?.counts;
  const open = stats ? stats.total - stats.done : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
        <h1>الرئيسية</h1>
        <span className="text-xs text-ink3">مرحبًا {user.name} — {ROLE_LABELS[user.role]}</span>
        <span className="flex-1" />
        <Link href="/tasks/new" className="btn primary">+ مهمة جديدة</Link>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <Link href="/tasks" className="tile no-underline text-ink"><span className="l">مهام مفتوحة في نطاقك</span><span className="v">{open !== null ? ar(open) : '…'}</span><span className="d">{stats ? `${ar(stats.inProgress)} قيد التنفيذ · ${ar(stats.notStarted)} لم تبدأ` : ''}</span></Link>
        <Link href="/tasks?overdue=true" className="tile no-underline text-ink"><span className="l">متأخرة</span><span className="v" style={stats?.overdue ? { color: 'var(--bad)' } : undefined}>{stats ? ar(stats.overdue) : '…'}</span><span className="d">تجاوزت موعدها ولم تكتمل</span></Link>
        <Link href="/tasks?mine=true" className="tile no-underline text-ink"><span className="l">مسندة إليّ</span><span className="v">{stats ? ar(stats.mine) : '…'}</span><span className="d">مباشرةً وغير مكتملة</span></Link>
        <div className="tile"><span className="l">مكتملة</span><span className="v" style={{ color: 'var(--ok)' }}>{stats ? ar(stats.done) : '…'}</span><span className="d">من {stats ? ar(stats.total) : '…'} في نطاقك</span></div>
        <div className="tile"><span className="l">موظفون نشطون في نطاقك</span><span className="v">{c ? ar(c.users) : '…'}</span><span className="d">{c ? `${ar(c.administrations)} إدارة · ${ar(c.sections)} قسمًا` : ''}</span></div>
      </div>
      {error && <p className="note" style={{ color: 'var(--bad)' }}>{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card-s">
          <div className="sec-h"><h2>أحدث المهام</h2><Link href="/tasks" className="btn">كل المهام</Link></div>
          <div className="list">
            {recent?.items.map((t) => (
              <Link key={t.id} href={`/tasks/${t.id}`} className="row link no-underline text-ink">
                <span className="tabular-nums text-ink3">#{ar(t.seq)}</span>
                <span className="grow">{t.title}</span>
                <span className="muted">{assigneesLine(t.assignments)}</span>
                <CategoryPill c={t.category} />
                <StatePill t={t} />
                <span className={`text-xs ${isOverdue(t) ? 'late' : 'text-ink3'}`}>{fmtDay(t.dueDate)}</span>
              </Link>
            ))}
            {recent && recent.items.length === 0 && <p className="tiny">لا مهام في نطاقك بعد.</p>}
            {!recent && <p className="tiny">جارٍ التحميل…</p>}
          </div>
        </div>
        <div className="card-s">
          <h3>سعتك (أساس محرك الانحراف)</h3>
          <dl className="m-0 grid gap-2.5">
            <div className="grid gap-0.5"><dt className="text-xs text-ink3">ساعات العمل المنتجة يوميًا</dt><dd className="m-0 font-medium">{ar(user.dailyCapacityHours)} ساعات</dd></div>
            <div className="grid gap-0.5"><dt className="text-xs text-ink3">أيام العمل</dt><dd className="m-0 font-medium">{user.workingDays.map((d) => WEEKDAY_LABELS[d]).join('، ')}</dd></div>
            <div className="grid gap-0.5"><dt className="text-xs text-ink3">مصدر الهوية</dt><dd className="m-0 font-medium">{user.authSource === 'local' ? 'محلي' : 'LDAP'}</dd></div>
          </dl>
          <p className="note">المرحلة 2: المهام تلتقط الحجم والتوقيت. Kanban والتقويم في المرحلة 4، والمحرك في المرحلة 6.</p>
        </div>
      </div>
    </>
  );
}
