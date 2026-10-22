'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import {
  SIZE_PRESET_LABELS, TASK_CATEGORY_LABELS, TASK_PRIORITY_LABELS, TASK_STATE_LABELS, type OrgTree, type TaskListResponse,
} from '@task/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ar, assigneesLine, CategoryPill, daysLeft, fmtDay, isOverdue, StatePill } from '@/components/tasks/bits';

const PAGE = 25;

/** #page-tasks في prototype.html: فلاتر أساسية + جدول */
function TasksInner() {
  const { user } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const [data, setData] = useState<TaskListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<OrgTree | null>(null);

  const q = sp.get('q') ?? '';
  const state = sp.get('state') ?? '';
  const category = sp.get('category') ?? '';
  const priority = sp.get('priority') ?? '';
  const sectionId = sp.get('sectionId') ?? '';
  const assigneeUserId = sp.get('assigneeUserId') ?? '';
  const overdue = sp.get('overdue') === 'true';
  const mine = sp.get('mine') === 'true';
  const page = Math.max(1, Number(sp.get('page') ?? 1));
  const [qInput, setQInput] = useState(q);
  useEffect(() => { setQInput(q); }, [q]);

  const setParam = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (!('page' in patch)) next.delete('page');
    router.push(`/tasks${next.toString() ? `?${next}` : ''}`);
  }, [router, sp]);

  useEffect(() => {
    api<OrgTree>('/org/tree').then(setTree).catch(() => undefined);
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (state) qs.set('state', state);
    if (category) qs.set('category', category);
    if (priority) qs.set('priority', priority);
    if (sectionId) qs.set('sectionId', sectionId);
    if (assigneeUserId) qs.set('assigneeUserId', assigneeUserId);
    if (overdue) qs.set('overdue', 'true');
    if (mine) qs.set('mine', 'true');
    qs.set('skip', String((page - 1) * PAGE));
    qs.set('take', String(PAGE));
    setData(null);
    api<TaskListResponse>(`/tasks?${qs}`).then((d) => { setData(d); setError(null); }).catch((e) => setError(e instanceof ApiError ? e.message : 'تعذّر تحميل المهام'));
  }, [q, state, category, priority, sectionId, assigneeUserId, overdue, mine, page]);

  // خيارات الفلاتر من الشجرة ضمن النطاق
  const sections = tree?.generalAdmins.flatMap((g) => g.administrations.flatMap((a) => a.sections.map((s) => ({ id: s.id, name: `${s.name} · ${a.name}` })))) ?? [];
  const people = tree
    ? [...tree.unassigned, ...tree.generalAdmins.flatMap((g) => [...g.users, ...g.administrations.flatMap((a) => [...a.users, ...a.sections.flatMap((s) => s.users)])])]
    : [];
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;

  return (
    <>
      <div className="ph">
        <h1>المهام</h1>
        <span className="crumb">{data ? `${ar(data.total)} مهمة في نطاقك` : '…'}</span>
        <span className="spacer" />
        <Link href="/tasks/new" className="btn primary">+ مهمة جديدة</Link>
      </div>

      <div className="filters">
        <form onSubmit={(e) => { e.preventDefault(); setParam({ q: qInput.trim() || null }); }} className="contents">
          <input type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="بحث… (عنوان أو #رقم) ثم Enter" aria-label="بحث" />
        </form>
        <select aria-label="الحالة" value={state} onChange={(e) => setParam({ state: e.target.value || null })}>
          <option value="">كل الحالات</option>
          {Object.entries(TASK_STATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="التصنيف" value={category} onChange={(e) => setParam({ category: e.target.value || null })}>
          <option value="">عرضية ودورية</option>
          {Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="الأولوية" value={priority} onChange={(e) => setParam({ priority: e.target.value || null })}>
          <option value="">كل الأولويات</option>
          {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {sections.length > 1 && (
          <select aria-label="القسم" value={sectionId} onChange={(e) => setParam({ sectionId: e.target.value || null })}>
            <option value="">كل الأقسام</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {people.length > 1 && (
          <select aria-label="الموظف" value={assigneeUserId} onChange={(e) => setParam({ assigneeUserId: e.target.value || null })}>
            <option value="">كل الموظفين</option>
            {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <button type="button" className={`pill ${overdue ? 'bad' : 'grey'} cursor-pointer border-0`} aria-pressed={overdue} onClick={() => setParam({ overdue: overdue ? null : 'true' })}>المتأخرة فقط {overdue ? '✕' : ''}</button>
        <button type="button" className={`pill ${mine ? 'acc' : 'grey'} cursor-pointer border-0`} aria-pressed={mine} onClick={() => setParam({ mine: mine ? null : 'true' })}>المسندة إليّ {mine ? '✕' : ''}</button>
      </div>

      {error && <p className="note" style={{ color: 'var(--bad)' }}>{error}</p>}

      <div className="tbl">
        <table>
          <thead>
            <tr><th>#</th><th>المهمة</th><th>التصنيف</th><th>المسند إليه</th><th>الحالة</th><th>الأولوية</th><th>الحجم</th><th>الموعد</th><th>الفرعية</th></tr>
          </thead>
          <tbody>
            {!data && !error && <tr><td colSpan={9} className="tiny">جارٍ التحميل…</td></tr>}
            {data && data.items.length === 0 && <tr><td colSpan={9} className="tiny">لا مهام تطابق الفلاتر{user?.role === 'employee' ? ' — تظهر هنا المهام المسندة إليك فقط' : ''}.</td></tr>}
            {data?.items.map((t) => {
              const left = daysLeft(t.dueDate);
              return (
                <tr key={t.id} className="link" onClick={() => router.push(`/tasks/${t.id}`)}>
                  <td className="num">{ar(t.seq)}</td>
                  <td><Link href={`/tasks/${t.id}`} className="text-ink no-underline hover:underline" onClick={(e) => e.stopPropagation()}>{t.title}</Link></td>
                  <td><CategoryPill c={t.category} /></td>
                  <td>{assigneesLine(t.assignments)}</td>
                  <td><StatePill t={t} /></td>
                  <td>{TASK_PRIORITY_LABELS[t.priority]}</td>
                  <td className="text-xs text-ink2">{t.sizePreset ? `${SIZE_PRESET_LABELS[t.sizePreset]}${t.estimatedHours ? ` · ${ar(t.estimatedHours)} س` : ''}` : t.estimatedHours ? `${ar(t.estimatedHours)} س` : '—'}</td>
                  <td className={isOverdue(t) ? 'late' : ''}>{fmtDay(t.dueDate)}{left !== null && t.state !== 'done' && left >= 0 && left <= 3 && <span className="pill warn ms-1">بقي {ar(left)} أيام</span>}</td>
                  <td className="num">{t.state === 'done' ? '✓' : t.subtaskCount ? `${ar(t.subtaskDoneCount)}/${ar(t.subtaskCount)}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data && data.total > PAGE && (
        <div className="flex items-center gap-2 text-xs text-ink3">
          <span>عرض {ar(Math.min(data.total, (page - 1) * PAGE + 1))}–{ar(Math.min(data.total, page * PAGE))} من {ar(data.total)} · الصفحة {ar(page)} من {ar(pages)}</span>
          <span className="flex-1" />
          <button type="button" className="btn" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>السابقة</button>
          <button type="button" className="btn" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>التالية</button>
        </div>
      )}
    </>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<p className="tiny">جارٍ التحميل…</p>}>
      <TasksInner />
    </Suspense>
  );
}
