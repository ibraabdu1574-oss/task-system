'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import {
  ASSIGNEE_TYPE_LABELS, TASK_CATEGORY_LABELS, TASK_PRIORITY_LABELS, type SizePreset, type TaskCategory, type TaskDetail, type TaskPriority,
} from '@task/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AssigneePicker, type PickOption } from '@/components/tasks/AssigneePicker';
import { SizePicker } from '@/components/tasks/SizePicker';
import { ar, initials } from '@/components/tasks/bits';

/** #page-new في prototype.html: نموذج مهمة جديدة باختيار الحجم وإسناد متعدد (أو فرعية عبر ?parent=) */
function NewTaskInner() {
  const { user } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const parentId = sp.get('parent');
  const [parent, setParent] = useState<TaskDetail | null>(null);
  const [assignees, setAssignees] = useState<PickOption[]>([]);
  const [size, setSize] = useState<SizePreset | null>(null);
  const [hours, setHours] = useState<string>('');
  const [category, setCategory] = useState<TaskCategory>('adhoc');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parentId) return;
    api<TaskDetail>(`/tasks/${parentId}`).then((p) => { setParent(p); setCategory(p.category); }).catch((e) => setError(e instanceof ApiError ? e.message : 'تعذّر تحميل المهمة الأم'));
  }, [parentId]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      title: (fd.get('title') as string).trim(),
      description: (fd.get('description') as string).trim() || undefined,
      category: fd.get('category'),
      priority: fd.get('priority'),
      dueDate: (fd.get('dueDate') as string) || undefined,
      sizePreset: size ?? undefined,
      estimatedHours: hours ? Number(hours) : undefined,
      assignments: assignees.map((a) => ({ assigneeType: a.assigneeType, assigneeId: a.assigneeId })),
    };
    if (parentId) body.parentTaskId = parentId;
    setBusy(true); setError(null);
    try {
      const t = await api<TaskDetail>('/tasks', { method: 'POST', body: JSON.stringify(body) });
      router.push(`/tasks/${t.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'فشل الحفظ');
      setBusy(false);
    }
  }

  const exclude = new Set<string>(assignees.map((a) => `${a.assigneeType}:${a.assigneeId}`));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={submit} className="contents">
      <div className="ph">
        <h1>{parent ? 'مهمة فرعية جديدة' : 'مهمة جديدة'}</h1>
        {parent && <span className="crumb"><Link href={`/tasks/${parent.id}`}>#{ar(parent.seq)} {parent.title}</Link></span>}
        <span className="spacer" />
        <Link href={parent ? `/tasks/${parent.id}` : '/tasks'} className="btn">إلغاء</Link>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ وإسناد'}</button>
      </div>
      {error && <p className="note" style={{ color: 'var(--bad)' }}>{error}</p>}

      <div className="three">
        <div className="card-s">
          <div className="field"><label htmlFor="nt">عنوان المهمة *</label><input id="nt" name="title" required maxLength={200} placeholder="مثال: مراجعة صلاحيات نظام المشتريات" /></div>
          <div className="field"><label htmlFor="nd">الوصف</label><textarea id="nd" name="description" rows={4} maxLength={5000} placeholder="ما المطلوب تحديدًا، وما معيار الاكتمال؟" /></div>
          <div className="two">
            <div className="field">
              <label htmlFor="ncat">التصنيف *</label>
              <select id="ncat" name="category" value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
                <option value="adhoc">{TASK_CATEGORY_LABELS.adhoc} — طلب طارئ أو غير مجدول</option>
                <option value="routine">{TASK_CATEGORY_LABELS.routine} — تتكرر بجدول ثابت</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="npr">الأولوية</label>
              <select id="npr" name="priority" defaultValue="medium">
                {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="ndue">الموعد النهائي</label><input id="ndue" name="dueDate" type="date" min={today} defaultValue={parent?.dueDate ?? ''} /></div>
            <div className="field">
              <label htmlFor="nest">الوقت المقدّر (ساعات) <span className="text-ink3">— يُشتق من الحجم، ويمكن تجاوزه</span></label>
              <input id="nest" type="number" min={0.25} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} placeholder={size ? 'من الحجم' : '—'} />
            </div>
          </div>
          <SizePicker value={size} onChange={(s, h) => { setSize(s); setHours(h ? String(h) : ''); }} administrationId={parent?.administrationId ?? user?.administrationId ?? null} />

          <div className="sec">
            <div className="sec-h"><h3>الإسناد</h3><span className="tiny">{user?.role === 'employee' ? 'تُسند إليك تلقائيًا إن تُركت فارغة' : 'يمكن إسناد المهمة لأكثر من جهة'}</span></div>
            <div className="list">
              {assignees.map((a) => (
                <div key={`${a.assigneeType}:${a.assigneeId}`} className="row">
                  <span className={`avatar ${a.assigneeType === 'user' ? '' : 'sq'}`}>{a.assigneeType === 'user' ? initials(a.name) : ASSIGNEE_TYPE_LABELS[a.assigneeType][0]}</span>
                  <span className="grow">{a.name} <span className="muted">— {a.detail}</span></span>
                  <span className="pill grey">{ASSIGNEE_TYPE_LABELS[a.assigneeType]}</span>
                  <button type="button" className="btn" onClick={() => setAssignees(assignees.filter((x) => x !== a))} aria-label={`إزالة ${a.name}`}>✕</button>
                </div>
              ))}
              <AssigneePicker exclude={exclude} onPick={(o) => setAssignees([...assignees, o])} />
            </div>
          </div>
        </div>

        <div className="card-s content-start">
          <h3>ما يُلتقط الآن لمحرك الانحراف</h3>
          <p className="desc">الحجم يُترجم إلى ساعات تقديرية، ويُسجَّل وقت البدء والاكتمال تلقائيًا من انتقالات الحالة. المحرك نفسه (استهلاك السعة، المهام المنزاحة والمهدّدة) يُبنى في المرحلة 6 على هذه البيانات.</p>
          {parent && <div className="note">هذه مهمة فرعية من «{parent.title}» — موقعها موقع الأم، وإسنادها مستقل.</div>}
          <div className="note">سيُسجَّل إنشاء المهمة باسمك في سجل التدقيق وسجل نشاط المهمة.</div>
        </div>
      </div>
    </form>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense fallback={<p className="tiny">جارٍ التحميل…</p>}>
      <NewTaskInner />
    </Suspense>
  );
}
