'use client';

import {
  ASSIGNEE_TYPE_LABELS, TASK_CATEGORY_LABELS, TASK_PRIORITY_LABELS, TASK_STATE_LABELS,
  type TaskActivityView, type TaskAssignmentView, type TaskCategory, type TaskPriority, type TaskState, type TaskSummary,
} from '@task/shared';

/* ═══ أدوات عرض مشتركة لصفحات المهام — بهوية prototype.html ═══ */

export const ar = (n: number) => n.toLocaleString('ar-EG');
export const initials = (name: string) => name.replace(/^(م\.|د\.|أ\.)\s*/, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join(' ');

const DAY = 86_400_000;
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const parseDay = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`);

export const fmtDay = (s: string | null | undefined) =>
  s ? parseDay(s).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' }) : '—';
export const fmtDayFull = (s: string | null | undefined) =>
  s ? parseDay(s).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
export const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `اليوم ${d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' }) + ' ' + d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
};
export const fmtSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** أيام متبقية (سالب = متأخرة) */
export const daysLeft = (due: string | null) => (due ? Math.round((parseDay(due).getTime() - todayStart().getTime()) / DAY) : null);
export const isOverdue = (t: Pick<TaskSummary, 'dueDate' | 'state'>) => t.state !== 'done' && (daysLeft(t.dueDate) ?? 1) < 0;

export function CategoryPill({ c }: { c: TaskCategory }) {
  return <span className={`pill ${c}`}><span className="dot" />{TASK_CATEGORY_LABELS[c]}</span>;
}
export function StatePill({ t }: { t: Pick<TaskSummary, 'state' | 'dueDate'> }) {
  if (isOverdue(t)) return <span className="pill bad">متأخرة · {TASK_STATE_LABELS[t.state]}</span>;
  const cls: Record<TaskState, string> = { not_started: 'grey', in_progress: 'warn', done: 'ok' };
  return <span className={`pill ${cls[t.state]}`}>{TASK_STATE_LABELS[t.state]}</span>;
}
export function PriorityPill({ p }: { p: TaskPriority }) {
  return <span className={`pill ${p === 'high' ? 'adhoc' : 'grey'}`}>أولوية {TASK_PRIORITY_LABELS[p]}</span>;
}

/** الجهات المسندة باختصار: «سارة المطيري +٢» */
export function assigneesLine(a: TaskAssignmentView[]) {
  if (!a.length) return 'غير مسندة';
  const first = a[0].assigneeType === 'user' ? a[0].name : `${ASSIGNEE_TYPE_LABELS[a[0].assigneeType]} ${a[0].name}`;
  return a.length > 1 ? `${first} +${ar(a.length - 1)}` : first;
}

export function AssigneeRow({ a, onRemove }: { a: TaskAssignmentView; onRemove?: () => void }) {
  return (
    <div className="row">
      <span className={`avatar ${a.assigneeType === 'user' ? '' : 'sq'}`}>{a.assigneeType === 'user' ? initials(a.name) : ASSIGNEE_TYPE_LABELS[a.assigneeType][0]}</span>
      <span className="grow">{a.name} {a.detail && <span className="muted">— {a.detail}</span>}</span>
      <span className="pill grey">{ASSIGNEE_TYPE_LABELS[a.assigneeType]}</span>
      {onRemove && <button type="button" className="btn" onClick={onRemove} aria-label={`إزالة ${a.name}`}>✕</button>}
    </div>
  );
}

/** جملة عربية لكل سجل نشاط */
export function activityText(x: TaskActivityView): string {
  const who = x.actor?.name ?? 'النظام';
  const d = (x.data ?? {}) as Record<string, unknown>;
  const names = (v: unknown) => (Array.isArray(v) && v.length ? v.join('، ') : '');
  switch (x.type) {
    case 'created': {
      const cat = d.category === 'adhoc' ? 'عرضية' : d.category === 'routine' ? 'دورية' : '';
      return `أنشأ ${who} المهمة${cat ? ` وصنّفها «${cat}»` : ''}${names(d.assignees) ? ` وأسندها إلى: ${names(d.assignees)}` : ''}`;
    }
    case 'updated': {
      const ch = (d.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
      const labels: Record<string, string> = { title: 'العنوان', description: 'الوصف', category: 'التصنيف', priority: 'الأولوية', dueDate: 'الموعد', sizePreset: 'الحجم', estimatedHours: 'الساعات المقدّرة' };
      return `عدّل ${who}: ${Object.keys(ch).map((k) => labels[k] ?? k).join('، ')}`;
    }
    case 'state_changed':
      return `${who}: ${TASK_STATE_LABELS[d.from as TaskState] ?? d.from} ← ${TASK_STATE_LABELS[d.to as TaskState] ?? d.to}`;
    case 'assigned':
      return `أسند ${who} المهمة إلى: ${names(d.assignees)}`;
    case 'unassigned':
      return `أزال ${who} الإسناد عن: ${String(d.assignee ?? '')}`;
    case 'subtask_created':
      return `أضاف ${who} مهمة فرعية: «${String(d.title ?? '')}»${names(d.assignees) ? ` (${names(d.assignees)})` : ''}`;
    case 'comment_added':
      return `علّق ${who}: «${String(d.excerpt ?? '')}»`;
    case 'comment_deleted':
      return `حذف ${who} تعليقًا`;
    case 'attachment_added':
      return `أرفق ${who}: ${String(d.fileName ?? '')}`;
    case 'attachment_deleted':
      return `حذف ${who} المرفق: ${String(d.fileName ?? '')}`;
    default:
      return `${who}: ${x.type}`;
  }
}
