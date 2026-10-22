'use client';

import { useEffect, useMemo, useState } from 'react';
import { ASSIGNEE_TYPE_LABELS, ROLE_LABELS, type AssigneeType, type OrgTree } from '@task/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { initials } from './bits';

export interface PickOption {
  assigneeType: AssigneeType;
  assigneeId: string;
  name: string;
  detail: string;
}

/** يحوّل شجرة الهيكل (ضمن نطاق الفاعل) إلى خيارات إسناد: موظفون وأقسام وإدارات وإدارات عامة */
function flatten(tree: OrgTree): PickOption[] {
  const out: PickOption[] = [];
  for (const g of tree.generalAdmins) {
    out.push({ assigneeType: 'generalAdmin', assigneeId: g.id, name: g.name, detail: 'كل موظفي الإدارة العامة' });
    for (const u of g.users) out.push({ assigneeType: 'user', assigneeId: u.id, name: u.name, detail: `${ROLE_LABELS[u.role]} · ${u.employeeNo}` });
    for (const a of g.administrations) {
      out.push({ assigneeType: 'administration', assigneeId: a.id, name: a.name, detail: `كل موظفي الإدارة · ${g.name}` });
      for (const u of a.users) out.push({ assigneeType: 'user', assigneeId: u.id, name: u.name, detail: `${ROLE_LABELS[u.role]} · ${a.name}` });
      for (const s of a.sections) {
        out.push({ assigneeType: 'section', assigneeId: s.id, name: s.name, detail: `كل موظفي القسم · ${a.name}` });
        for (const u of s.users) out.push({ assigneeType: 'user', assigneeId: u.id, name: u.name, detail: `${ROLE_LABELS[u.role]} · ${s.name}` });
      }
    }
  }
  for (const u of tree.unassigned) out.push({ assigneeType: 'user', assigneeId: u.id, name: u.name, detail: `${ROLE_LABELS[u.role]} · ${u.employeeNo}` });
  return out;
}

/**
 * حقل بحث عن جهة إسناد (موظف/قسم/إدارة/إدارة عامة) من الهيكل ضمن نطاق الفاعل.
 * الموظف (بلا tasks.assign) يرى نفسه فقط — والخلفية تعيد الفحص على أي حال.
 */
export function AssigneePicker({ exclude, onPick, placeholder }: { exclude: Set<string>; onPick: (o: PickOption) => void; placeholder?: string }) {
  const { user } = useAuth();
  const [options, setOptions] = useState<PickOption[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const canAssign = !!user && user.role !== 'employee';

  useEffect(() => {
    if (!user) return;
    if (!canAssign) {
      setOptions([{ assigneeType: 'user', assigneeId: user.id, name: user.name, detail: `${ROLE_LABELS[user.role]} · ${user.employeeNo}` }]);
      return;
    }
    api<OrgTree>('/org/tree').then((t) => setOptions(flatten(t))).catch(() => setOptions([]));
  }, [user, canAssign]);

  const matches = useMemo(() => {
    const s = q.trim();
    return options.filter((o) => !exclude.has(`${o.assigneeType}:${o.assigneeId}`) && (!s || o.name.includes(s) || o.detail.includes(s))).slice(0, 12);
  }, [options, q, exclude]);

  return (
    <div className="picker">
      <div className="row" style={{ background: 'var(--surface)', borderStyle: 'dashed' }}>
        <input
          className="flex-1 border-0 bg-transparent text-ink outline-none"
          placeholder={placeholder ?? (canAssign ? 'ابحث عن موظف أو قسم أو إدارة…' : 'أضف نفسك كجهة إسناد')}
          aria-label="إضافة جهة"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && matches.length > 0 && (
        <div className="menu" role="listbox">
          {matches.map((o) => (
            <button key={`${o.assigneeType}:${o.assigneeId}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(o); setQ(''); setOpen(false); }}>
              <span className={`avatar ${o.assigneeType === 'user' ? '' : 'sq'}`}>{o.assigneeType === 'user' ? initials(o.name) : ASSIGNEE_TYPE_LABELS[o.assigneeType][0]}</span>
              <span className="flex-1">{o.name} <span className="text-xs text-ink3">— {o.detail}</span></span>
              <span className="pill grey">{ASSIGNEE_TYPE_LABELS[o.assigneeType]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
