'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ROLE_LABELS, type OrgTree, type OrgTreeAdministration, type OrgTreeGeneralAdmin, type OrgTreeSection, type OrgTreeUser } from '@task/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const ar = (n: number) => n.toLocaleString('ar-EG');
const initials = (name: string) => name.replace(/^(م\.|د\.|أ\.)\s*/, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join(' ');

type Selected =
  | { kind: 'generalAdmin'; node: OrgTreeGeneralAdmin }
  | { kind: 'administration'; node: OrgTreeAdministration; parent: OrgTreeGeneralAdmin }
  | { kind: 'section'; node: OrgTreeSection; parent: OrgTreeAdministration }
  | null;

export default function OrgPage() {
  const { user } = useAuth();
  const [tree, setTree] = useState<OrgTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTree(await api<OrgTree>('/org/tree'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر تحميل الهيكل');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const canManage = user && ['ceo', 'generalAdminManager', 'adminManager'].includes(user.role);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg(done); await load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'فشل الطلب'); }
    finally { setBusy(false); }
  }

  // ── إنشاء وحدة جديدة تحت العنصر المحدّد ──
  async function createChild(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = (new FormData(e.currentTarget).get('name') as string).trim();
    if (!name) return;
    if (!selected) return run(() => api('/org/general-admins', { method: 'POST', body: JSON.stringify({ name }) }), 'أُنشئت الإدارة العامة');
    if (selected.kind === 'generalAdmin') return run(() => api('/org/administrations', { method: 'POST', body: JSON.stringify({ generalAdminId: selected.node.id, name }) }), 'أُنشئت الإدارة');
    if (selected.kind === 'administration') return run(() => api('/org/sections', { method: 'POST', body: JSON.stringify({ administrationId: selected.node.id, name }) }), 'أُنشئ القسم');
    e.currentTarget.reset();
  }
  async function rename() {
    if (!selected) return;
    const name = window.prompt('الاسم الجديد:', selected.node.name)?.trim();
    if (!name || name === selected.node.name) return;
    const path = { generalAdmin: 'general-admins', administration: 'administrations', section: 'sections' }[selected.kind];
    await run(() => api(`/org/${path}/${selected.node.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }), 'تم التعديل');
    setSelected(null);
  }
  async function remove() {
    if (!selected || !window.confirm(`حذف «${selected.node.name}»؟`)) return;
    const path = { generalAdmin: 'general-admins', administration: 'administrations', section: 'sections' }[selected.kind];
    await run(() => api(`/org/${path}/${selected.node.id}`, { method: 'DELETE' }), 'تم الحذف');
    setSelected(null);
  }
  async function assignHead() {
    if (!selected) return;
    const employeeNo = window.prompt('الرقم الوظيفي للمدير/المشرف (اتركه فارغًا لإزالة التعيين):')?.trim();
    if (employeeNo === undefined) return;
    await run(async () => {
      let userId: string | null = null;
      if (employeeNo) {
        const res = await api<{ items: { id: string; employeeNo: string }[] }>(`/users?q=${encodeURIComponent(employeeNo)}`);
        const found = res.items.find((u) => u.employeeNo === employeeNo);
        if (!found) throw new ApiError(404, 'لم يُعثر على موظف بهذا الرقم ضمن نطاقك');
        userId = found.id;
      }
      const target = selected.kind === 'section' ? `sections/${selected.node.id}/supervisor` : selected.kind === 'administration' ? `administrations/${selected.node.id}/manager` : `general-admins/${selected.node.id}/manager`;
      await api(`/org/${target}`, { method: 'PUT', body: JSON.stringify({ userId }) });
    }, 'تم التعيين');
  }

  const Person = ({ u }: { u: OrgTreeUser }) => (
    <div className={`row ${u.id === user?.id ? 'border-accent' : ''}`}>
      <span className="avatar">{initials(u.name)}</span>
      <span className="grow">{u.name} <span className="muted">— {ROLE_LABELS[u.role]} · {u.employeeNo}</span></span>
      <span className={`pill ${u.isActive ? 'ok' : 'grey'}`}>{u.isActive ? 'نشط' : 'معطّل'}</span>
    </div>
  );

  const Node = ({ k, name, who, active, onClick, children }: { k: string; name: string; who?: string; active?: boolean; onClick?: () => void; children?: React.ReactNode }) => (
    <li>
      <div className={`node ${active ? 'me' : ''} ${onClick ? 'cursor-pointer hover:border-accent' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
        <span className="k">{k}</span><b>{name}</b>{who && <span className="who">{who}</span>}
      </div>
      {children}
    </li>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
        <h1>الهيكل التنظيمي</h1>
        {tree && (
          <span className="text-xs text-ink3">
            {ar(tree.counts.generalAdmins)} إدارة عامة · {ar(tree.counts.administrations)} إدارة · {ar(tree.counts.sections)} قسمًا · {ar(tree.counts.users)} موظفًا
          </span>
        )}
        <span className="flex-1" />
        {canManage && selected && <button className="btn" type="button" onClick={() => setSelected(null)}>إلغاء التحديد</button>}
      </div>
      {error && <p className="note" style={{ color: 'var(--bad)' }}>{error}</p>}
      {!tree && !error && <p className="tiny">جارٍ التحميل…</p>}

      {tree && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="card-s">
            <ul className="tree">
              <Node k="الجهة" name="الجهة" who={tree.unassigned.length ? `${tree.unassigned.map((u) => u.name).join('، ')}` : undefined}>
                <ul>
                  {tree.generalAdmins.map((g) => (
                    <Node key={g.id} k="إدارة عامة" name={g.name} who={g.manager ? `المدير العام: ${g.manager.name}` : 'بلا مدير عام'} active={selected?.node.id === g.id} onClick={() => setSelected({ kind: 'generalAdmin', node: g })}>
                      <ul>
                        {g.administrations.map((a) => (
                          <Node key={a.id} k="إدارة" name={a.name} who={`${a.manager ? `المدير: ${a.manager.name}` : 'بلا مدير'}${a.followUpOfficers.length ? ` · متابعة: ${a.followUpOfficers.map((f) => f.name).join('، ')}` : ''}`} active={selected?.node.id === a.id} onClick={() => setSelected({ kind: 'administration', node: a, parent: g })}>
                            <ul>
                              {a.sections.map((s) => (
                                <Node key={s.id} k="قسم" name={s.name} who={`${s.supervisor ? `المشرف: ${s.supervisor.name}` : 'بلا مشرف'} · ${ar(s.users.length)} موظفين`} active={selected?.node.id === s.id} onClick={() => setSelected({ kind: 'section', node: s, parent: a })} />
                              ))}
                            </ul>
                          </Node>
                        ))}
                      </ul>
                    </Node>
                  ))}
                </ul>
              </Node>
            </ul>
          </div>

          <div className="grid content-start gap-4">
            <div className="card-s">
              {selected ? (
                <>
                  <h3>{selected.node.name}</h3>
                  <dl className="m-0 grid gap-2.5">
                    <div className="grid gap-0.5"><dt className="text-xs text-ink3">المستوى</dt><dd className="m-0 font-medium">{{ generalAdmin: 'إدارة عامة', administration: 'إدارة', section: 'قسم' }[selected.kind]}</dd></div>
                    {selected.kind !== 'generalAdmin' && <div className="grid gap-0.5"><dt className="text-xs text-ink3">تتبع</dt><dd className="m-0 font-medium">{selected.parent.name}</dd></div>}
                    <div className="grid gap-0.5">
                      <dt className="text-xs text-ink3">{selected.kind === 'section' ? 'المشرف' : 'المدير'}</dt>
                      <dd className="m-0 font-medium">{(selected.kind === 'section' ? selected.node.supervisor : selected.node.manager)?.name ?? '—'}</dd>
                    </div>
                    {selected.kind === 'administration' && selected.node.followUpOfficers.length > 0 && (
                      <div className="grid gap-0.5"><dt className="text-xs text-ink3">مسؤول المتابعة</dt><dd className="m-0 font-medium">{selected.node.followUpOfficers.map((f) => f.name).join('، ')} <span className="tiny">— صلاحية كاملة على مهام الإدارة</span></dd></div>
                    )}
                  </dl>
                  {canManage && (
                    <div className="flex flex-wrap gap-1.5">
                      <button className="btn" type="button" disabled={busy} onClick={rename}>تعديل الاسم</button>
                      <button className="btn" type="button" disabled={busy} onClick={assignHead}>{selected.kind === 'section' ? 'تعيين المشرف' : 'تعيين المدير'}</button>
                      <button className="btn danger" type="button" disabled={busy} onClick={remove}>حذف</button>
                    </div>
                  )}
                  {(selected.kind === 'section' || selected.kind === 'administration') && (
                    <div className="grid gap-2.5 border-t border-line pt-3.5">
                      <h3>{selected.kind === 'section' ? 'موظفو القسم' : 'منتسبون للإدارة بلا قسم'}</h3>
                      <div className="grid gap-1.5">
                        {(selected.node.users.length ? selected.node.users : []).map((u) => <Person key={u.id} u={u} />)}
                        {selected.node.users.length === 0 && <p className="tiny">لا أحد ضمن نطاقك هنا</p>}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h3>التفاصيل</h3>
                  <p className="tiny">اختر عنصرًا من الشجرة لعرضه{canManage ? ' أو تعديله' : ''}.</p>
                  <div className="note">الصلاحية تُحسب من موقعك في الهيكل لا من الدور وحده — فلا ترى إلا نطاقك.</div>
                </>
              )}
            </div>

            {canManage && (!selected || selected.kind !== 'section') && (
              <form className="card-s" onSubmit={createChild}>
                <h3>{!selected ? 'إدارة عامة جديدة' : selected.kind === 'generalAdmin' ? `إدارة جديدة في «${selected.node.name}»` : `قسم جديد في «${selected.node.name}»`}</h3>
                <div className="field"><label htmlFor="newName">الاسم</label><input id="newName" name="name" required maxLength={150} /></div>
                <button className="btn primary justify-self-start" type="submit" disabled={busy}>إنشاء</button>
              </form>
            )}
            {msg && <p className="note">{msg}</p>}
          </div>
        </div>
      )}
    </>
  );
}
