'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ATTACHMENT_POLICY, SIZE_PRESET_LABELS, TASK_CATEGORY_LABELS, TASK_PRIORITY_LABELS, TASK_STATE_LABELS, TASK_STATES,
  type CommentView, type TaskDetail, type TaskState,
} from '@task/shared';
import { api, ApiError, download, upload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AssigneePicker } from '@/components/tasks/AssigneePicker';
import { activityText, ar, AssigneeRow, assigneesLine, CategoryPill, daysLeft, fmtDayFull, fmtSize, fmtWhen, isOverdue, PriorityPill, StatePill } from '@/components/tasks/bits';

/** #page-task في prototype.html: الإسناد، الفرعية، المرفقات، التعليقات، البيانات، سجل النشاط */
export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [t, setT] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setT(await api<TaskDetail>(`/tasks/${id}`)); setError(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'تعذّر تحميل المهمة'); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true); setMsg(null);
    try { const r = await fn(); if (done) setMsg(done); if (r && typeof r === 'object' && 'activities' in (r as object)) setT(r as TaskDetail); else await load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'فشل الطلب'); }
    finally { setBusy(false); }
  }

  if (error) return <><div className="ph"><span className="crumb"><Link href="/tasks">المهام</Link></span></div><p className="note" style={{ color: 'var(--bad)' }}>{error}</p></>;
  if (!t) return <p className="tiny">جارٍ التحميل…</p>;

  const left = daysLeft(t.dueDate);
  const exclude = new Set<string>(t.assignments.map((a) => `${a.assigneeType}:${a.assigneeId}`));
  const canDeleteComment = (c: CommentView) => c.author.id === user?.id || t.can.manage;
  const nextStates = TASK_STATES.filter((s) => s !== t.state);

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      title: (fd.get('title') as string).trim(),
      description: (fd.get('description') as string).trim() || null,
      category: fd.get('category'), priority: fd.get('priority'),
      dueDate: (fd.get('dueDate') as string) || null,
      sizePreset: (fd.get('sizePreset') as string) || null,
      estimatedHours: fd.get('estimatedHours') ? Number(fd.get('estimatedHours')) : null,
    };
    await run(() => api<TaskDetail>(`/tasks/${t!.id}`, { method: 'PATCH', body: JSON.stringify(body) }), 'تم الحفظ');
    setEditing(false);
  }
  async function addComment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const content = (new FormData(form).get('content') as string).trim();
    if (!content) return;
    await run(() => api(`/tasks/${t!.id}/comments`, { method: 'POST', body: JSON.stringify({ content }) }));
    form.reset();
  }
  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > ATTACHMENT_POLICY.maxSizeMb * 1024 * 1024) { setMsg(`الحد الأقصى ${ATTACHMENT_POLICY.maxSizeMb} ميغابايت`); return; }
    await run(() => upload(`/tasks/${t!.id}/attachments`, f), 'رُفع الملف');
  }
  async function remove() {
    if (!window.confirm(`حذف «${t!.title}» وكل فرعياتها ومرفقاتها؟`)) return;
    await run(() => api(`/tasks/${t!.id}`, { method: 'DELETE' }));
    router.push(t!.parent ? `/tasks/${t!.parent.id}` : '/tasks');
  }

  return (
    <>
      <div className="ph">
        <span className="crumb">
          <Link href="/tasks">المهام</Link>
          {t.parent && <> › <Link href={`/tasks/${t.parent.id}`}>#{ar(t.parent.seq)} {t.parent.title}</Link></>}
          {' '}› #{ar(t.seq)}
        </span>
        <span className="spacer" />
        {t.can.manage && !editing && <button type="button" className="btn" onClick={() => setEditing(true)}>تعديل</button>}
        {t.can.manage && <button type="button" className="btn danger" onClick={remove} disabled={busy}>حذف</button>}
        {nextStates.map((s) => (
          <button key={s} type="button" className={`btn ${s === 'done' ? 'primary' : ''}`} disabled={busy} onClick={() => run(() => api<TaskDetail>(`/tasks/${t.id}/state`, { method: 'POST', body: JSON.stringify({ state: s }) }), `الحالة: ${TASK_STATE_LABELS[s]}`)}>
            {s === 'in_progress' ? '▶ ابدأ التنفيذ' : s === 'done' ? '✓ اكتملت' : '↺ إعادة إلى «لم تبدأ»'}
          </button>
        ))}
      </div>
      {msg && <p className="note">{msg}</p>}

      <div className="three">
        <div className="card-s">
          {editing ? (
            <form onSubmit={saveEdit} className="grid gap-3">
              <div className="field"><label htmlFor="et">العنوان *</label><input id="et" name="title" required maxLength={200} defaultValue={t.title} /></div>
              <div className="field"><label htmlFor="ed">الوصف</label><textarea id="ed" name="description" rows={4} defaultValue={t.description ?? ''} /></div>
              <div className="two">
                <div className="field"><label htmlFor="ec">التصنيف</label><select id="ec" name="category" defaultValue={t.category}>{Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div className="field"><label htmlFor="ep">الأولوية</label><select id="ep" name="priority" defaultValue={t.priority}>{Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div className="field"><label htmlFor="edue">الموعد النهائي</label><input id="edue" name="dueDate" type="date" defaultValue={t.dueDate ?? ''} /></div>
                <div className="field"><label htmlFor="es">الحجم</label><select id="es" name="sizePreset" defaultValue={t.sizePreset ?? ''}><option value="">—</option>{Object.entries(SIZE_PRESET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div className="field"><label htmlFor="eh">الساعات المقدّرة <span className="text-ink3">(اتركها فارغة لتُشتق من الحجم)</span></label><input id="eh" name="estimatedHours" type="number" min={0.25} step={0.25} defaultValue={t.estimatedHours ?? ''} /></div>
              </div>
              <div className="flex gap-2"><button type="submit" className="btn primary" disabled={busy}>حفظ</button><button type="button" className="btn" onClick={() => setEditing(false)}>إلغاء</button></div>
            </form>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[18px]">{t.title}</h1>
                <CategoryPill c={t.category} />
                <StatePill t={t} />
                <PriorityPill p={t.priority} />
              </div>
              {t.description ? <p className="desc">{t.description}</p> : <p className="tiny">بلا وصف.</p>}
            </>
          )}

          <div className="sec">
            <div className="sec-h"><h3>الإسناد ({ar(t.assignments.length)} {t.assignments.length === 1 ? 'جهة' : 'جهات'})</h3>{t.can.assign && <button type="button" className="btn" onClick={() => setAdding(!adding)}>{adding ? 'إغلاق' : '+ إضافة جهة'}</button>}</div>
            <div className="list">
              {t.assignments.map((a) => (
                <AssigneeRow key={a.id} a={a} onRemove={t.can.assign ? () => run(() => api<TaskDetail>(`/tasks/${t.id}/assignments/${a.id}`, { method: 'DELETE' }), 'أُزيل الإسناد') : undefined} />
              ))}
              {!t.assignments.length && <p className="tiny">غير مسندة بعد.</p>}
              {adding && t.can.assign && (
                <AssigneePicker exclude={exclude} onPick={(o) => run(() => api<TaskDetail>(`/tasks/${t.id}/assignments`, { method: 'POST', body: JSON.stringify({ assignments: [{ assigneeType: o.assigneeType, assigneeId: o.assigneeId }] }) }), `أُسندت إلى ${o.name}`)} />
              )}
            </div>
          </div>

          {!t.parent && (
            <div className="sec">
              <div className="sec-h"><h3>المهام الفرعية ({ar(t.subtaskDoneCount)} من {ar(t.subtaskCount)})</h3><Link href={`/tasks/new?parent=${t.id}`} className="btn">+ مهمة فرعية</Link></div>
              <div className="list">
                {t.subtasks.map((s) => (
                  <div key={s.id} className="row link" onClick={() => router.push(`/tasks/${s.id}`)} role="link" tabIndex={0}>
                    <span className={`pill ${s.state === 'done' ? 'ok' : s.state === 'in_progress' ? 'warn' : 'grey'}`}>{s.state === 'done' ? '✓' : s.state === 'in_progress' ? '●' : '○'}</span>
                    <span className="grow">#{ar(s.seq)} {s.title}</span>
                    <span className="muted">{assigneesLine(s.assignments)}</span>
                    <StatePill t={s} />
                  </div>
                ))}
                {!t.subtasks.length && <p className="tiny">لا مهام فرعية — قسّم المهمة إن كانت لأكثر من جهة أو مرحلة.</p>}
              </div>
            </div>
          )}

          <div className="sec">
            <div className="sec-h">
              <h3>المرفقات ({ar(t.attachments.length)})</h3>
              <input ref={fileRef} type="file" className="hidden" accept={ATTACHMENT_POLICY.allowedExtensions.map((x) => `.${x}`).join(',')} onChange={pickFile} />
              <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>+ رفع ملف</button>
            </div>
            <div className="list">
              {t.attachments.map((a) => (
                <div key={a.id} className="row">
                  <button type="button" className="grow text-start text-accent hover:underline" onClick={() => download(`/tasks/${t.id}/attachments/${a.id}/download`, a.fileName).catch((e: Error) => setMsg(e.message))}>{a.fileName}</button>
                  <span className="muted">{fmtSize(a.size)} · {a.uploadedBy.name} · {fmtWhen(a.createdAt)}</span>
                  {(a.uploadedBy.id === user?.id || t.can.manage) && <button type="button" className="btn" aria-label="حذف المرفق" onClick={() => window.confirm(`حذف «${a.fileName}»؟`) && run(() => api(`/tasks/${t.id}/attachments/${a.id}`, { method: 'DELETE' }), 'حُذف المرفق')}>✕</button>}
                </div>
              ))}
              {!t.attachments.length && <p className="tiny">لا مرفقات. المسموح: {ATTACHMENT_POLICY.allowedExtensions.join('، ')} — حتى {ATTACHMENT_POLICY.maxSizeMb} ميغابايت.</p>}
            </div>
          </div>

          <div className="sec">
            <h3>التعليقات ({ar(t.comments.length)})</h3>
            {t.comments.map((c) => (
              <div key={c.id} className="comment">
                <div><span className="who">{c.author.name}</span><span className="when">{fmtWhen(c.createdAt)}</span>{canDeleteComment(c) && <button type="button" className="ms-2 text-xs text-ink3 hover:text-bad" onClick={() => run(() => api(`/tasks/${t.id}/comments/${c.id}`, { method: 'DELETE' }))}>حذف</button>}</div>
                <p className="desc">{c.content}</p>
              </div>
            ))}
            <form onSubmit={addComment} className="grid gap-2">
              <textarea name="content" className="plain" rows={3} maxLength={5000} aria-label="تعليق جديد" placeholder="اكتب تعليقًا…" required />
              <button type="submit" className="btn primary justify-self-start" disabled={busy}>إرسال</button>
            </form>
          </div>
        </div>

        <div className="grid content-start gap-4">
          <div className="card-s">
            <h3>البيانات</h3>
            <dl className="kv">
              <div><dt>الموعد النهائي</dt><dd>{fmtDayFull(t.dueDate)} {left !== null && t.state !== 'done' && (left < 0 ? <span className="pill bad">متأخرة {ar(-left)} أيام</span> : <span className={`pill ${left <= 3 ? 'warn' : 'grey'}`}>بقي {ar(left)} أيام</span>)}</dd></div>
              <div><dt>الحجم</dt><dd>{t.sizePreset ? SIZE_PRESET_LABELS[t.sizePreset] : '—'}</dd></div>
              <div><dt>الوقت المقدّر</dt><dd>{t.estimatedHours != null ? `${ar(t.estimatedHours)} ساعة` : '—'}</dd></div>
              <div><dt>بدأت</dt><dd>{t.startedAt ? fmtWhen(t.startedAt) : '—'}</dd></div>
              <div><dt>اكتملت</dt><dd>{t.completedAt ? fmtWhen(t.completedAt) : '—'}</dd></div>
              <div><dt>أنشأها</dt><dd>{t.createdBy.name} · {fmtWhen(t.createdAt)}</dd></div>
              <div><dt>التصنيف</dt><dd>{TASK_CATEGORY_LABELS[t.category]} · أولوية {TASK_PRIORITY_LABELS[t.priority]}</dd></div>
              {isOverdue(t) && <div><dt>ملاحظة</dt><dd className="text-bad">تجاوزت موعدها — نوع التأخّر (داخلي/خارجي) يُضبط مع الحالات القابلة للتخصيص في المرحلة 3.</dd></div>}
            </dl>
          </div>
          <div className="card-s">
            <h3>سجل النشاط</h3>
            <ul className="tl">
              {t.activities.map((x) => <li key={x.id}><time>{fmtWhen(x.createdAt)}</time>{activityText(x)}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
