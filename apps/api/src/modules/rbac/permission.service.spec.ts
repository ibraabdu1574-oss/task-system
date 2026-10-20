import { PermissionService } from './permission.service';
import type { SessionUser } from '@task/shared';

const base: Omit<SessionUser, 'id' | 'role' | 'generalAdminId' | 'administrationId' | 'sectionId'> = {
  name: 'x', employeeNo: '0', email: 'x@x', authSource: 'local', dailyCapacityHours: 6, workingDays: [0, 1, 2, 3, 4], isActive: true,
};
const u = (p: Partial<SessionUser> & Pick<SessionUser, 'id' | 'role'>): SessionUser =>
  ({ ...base, generalAdminId: null, administrationId: null, sectionId: null, ...p } as SessionUser);

const GA = 'ga-1', AD = 'ad-1', SEC = 'sec-1', AD2 = 'ad-2', SEC2 = 'sec-2';
const ceo = u({ id: 'ceo', role: 'ceo' });
const gm = u({ id: 'gm', role: 'generalAdminManager', generalAdminId: GA });
const mgr = u({ id: 'mgr', role: 'adminManager', generalAdminId: GA, administrationId: AD });
const fuo = u({ id: 'fuo', role: 'followUpOfficer', generalAdminId: GA, administrationId: AD, sectionId: SEC });
const sup = u({ id: 'sup', role: 'supervisor', generalAdminId: GA, administrationId: AD, sectionId: SEC });
const emp = u({ id: 'emp', role: 'employee', generalAdminId: GA, administrationId: AD, sectionId: SEC });
const empElsewhere = { generalAdminId: GA, administrationId: AD2, sectionId: SEC2, userId: 'other' };
const empHere = { generalAdminId: GA, administrationId: AD, sectionId: SEC, userId: 'emp' };

describe('PermissionService — النطاق الهرمي', () => {
  const p = new PermissionService();

  it('الرئيس التنفيذي: نطاق الجهة كاملة', () => {
    expect(p.resolveScope(ceo).level).toBe('organization');
    expect(p.can(ceo, 'org.manage', { generalAdminId: GA }, 'generalAdmin')).toBe(true);
    expect(p.can(ceo, 'audit.read')).toBe(true);
  });

  it('المدير العام: يدير إدارات وأقسام إدارته العامة فقط، لا الإدارة العامة نفسها', () => {
    expect(p.can(gm, 'org.manage', { generalAdminId: GA, administrationId: AD }, 'administration')).toBe(true);
    expect(p.can(gm, 'org.manage', { generalAdminId: 'ga-2', administrationId: 'ad-9' }, 'administration')).toBe(false);
    expect(p.can(gm, 'org.manage', { generalAdminId: GA }, 'generalAdmin')).toBe(false);
    expect(p.can(gm, 'audit.read')).toBe(false);
  });

  it('مدير الإدارة: أقسامه وموظفوه فقط', () => {
    expect(p.can(mgr, 'org.manage', { generalAdminId: GA, administrationId: AD, sectionId: SEC }, 'section')).toBe(true);
    expect(p.can(mgr, 'org.manage', { generalAdminId: GA, administrationId: AD }, 'administration')).toBe(false);
    expect(p.can(mgr, 'users.manage', empHere, 'user')).toBe(true);
    expect(p.can(mgr, 'users.manage', empElsewhere, 'user')).toBe(false);
  });

  it('مسؤول المتابعة: نطاقه إدارته كاملة رغم كونه في قسم، لكنه لا يدير الهيكل', () => {
    const s = p.resolveScope(fuo);
    expect(s.level).toBe('administration');
    expect(s.followUpOfficer).toBe(true);
    expect(p.can(fuo, 'users.read', { generalAdminId: GA, administrationId: AD, sectionId: 'sec-other' })).toBe(true);
    expect(p.can(fuo, 'leaves.manage', { generalAdminId: GA, administrationId: AD, sectionId: 'sec-other', userId: 'z' })).toBe(true);
    expect(p.can(fuo, 'org.manage', { generalAdminId: GA, administrationId: AD, sectionId: SEC }, 'section')).toBe(false);
  });

  it('المشرف: قسمه فقط', () => {
    expect(p.can(sup, 'users.read', empHere)).toBe(true);
    expect(p.can(sup, 'users.read', { ...empHere, sectionId: SEC2 })).toBe(false);
    expect(p.can(sup, 'users.manage', empHere, 'user')).toBe(false);
  });

  it('الموظف: نفسه فقط', () => {
    expect(p.resolveScope(emp).level).toBe('user');
    expect(p.can(emp, 'leaves.read', empHere)).toBe(true);
    expect(p.can(emp, 'leaves.manage', empHere, 'user')).toBe(true);
    expect(p.can(emp, 'leaves.read', { ...empHere, userId: 'colleague' })).toBe(false);
    expect(p.can(emp, 'org.manage', { generalAdminId: GA }, 'generalAdmin')).toBe(false);
    expect(p.can(emp, 'users.manage', empHere, 'user')).toBe(false);
  });

  it('دور بلا موقع مكتمل ينكمش إلى أقل صلاحية', () => {
    const orphan = u({ id: 'o', role: 'adminManager' });
    expect(p.resolveScope(orphan).level).toBe('user');
    expect(p.can(orphan, 'users.manage', empHere, 'user')).toBe(false);
  });

  it('حساب معطّل: لا شيء', () => {
    expect(p.can({ ...ceo, isActive: false }, 'org.read')).toBe(false);
  });
});
